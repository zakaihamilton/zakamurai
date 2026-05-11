import { env, pipeline } from '@huggingface/transformers';
import * as lancedb from '@lancedb/lancedb';

// Configure transformers.js for WebGPU and browser environment
env.allowLocalModels = false;
env.useBrowserCache = true;

let extractor;
let db;
let table;

async function init() {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      device: 'webgpu',
      dtype: 'fp16',
    });
  }

  if (!db) {
    db = await lancedb.connect('opfs://zakamurai-rag-db');
    // Schema definition for the table
    const _schema = {
      vector: new Float32Array(384),
      filePath: 'string',
      content: 'string',
      hash: 'string',
      cssLinks: 'string', // JSON serialized array of linked CSS module paths
    };

    // Check if table exists, else create it
    const tableNames = await db.tableNames();
    if (tableNames.includes('chunks')) {
      table = await db.openTable('chunks');
    } else {
      // LanceDB requires initial dummy objects to infer the schema
      // when using a plain JS object schema definition in the JS client
      const initialData = [
        {
          vector: new Array(384).fill(0),
          filePath: 'init',
          content: 'init',
          hash: 'init',
          cssLinks: '[]',
        },
      ];
      table = await db.createTable('chunks', initialData);
    }
  }
}

async function getHash(text) {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function chunkVanillaJs(content, filePath) {
  // Simple syntax-aware chunker: split by export keywords and function boundaries
  const chunks = [];
  const regex =
    /(?:export\s+(?:default\s+)?(?:function|class|const|let|var))[\s\S]*?(?=\nexport\s+(?:default\s+)?(?:function|class|const|let|var)|\n$)/g;

  let match = regex.exec(content);

  while (match !== null) {
    const chunkText = match[0].trim();
    if (chunkText) {
      chunks.push({
        content: chunkText,
        filePath,
      });
    }
    match = regex.exec(content);
  }

  // If no exports found or un-matched content, split by double newline as fallback
  if (chunks.length === 0) {
    const fallbackChunks = content.split(/\n\s*\n/);
    for (const chunk of fallbackChunks) {
      if (chunk.trim()) {
        chunks.push({
          content: chunk.trim(),
          filePath,
        });
      }
    }
  }

  // Context Linking: Extract .module.css imports
  const cssModuleRegex = /import\s+(?:.*?\s+from\s+)?['"](.*\.module\.css)['"]/g;
  const cssLinks = [];
  let cssMatch = cssModuleRegex.exec(content);
  while (cssMatch !== null) {
    cssLinks.push(cssMatch[1]);
    cssMatch = cssModuleRegex.exec(content);
  }

  for (const chunk of chunks) {
    chunk.cssLinks = JSON.stringify(cssLinks);
  }

  return chunks;
}

function chunkCss(content, filePath) {
  // Split CSS by rules
  const chunks = [];
  const rules = content.split('}');
  for (const rule of rules) {
    if (rule.trim()) {
      chunks.push({
        content: `${rule.trim()}}`,
        filePath,
        cssLinks: '[]', // CSS files typically don't import other CSS modules in this context
      });
    }
  }
  return chunks;
}

async function indexFile({ filePath, content }) {
  await init();

  let chunks = [];
  if (filePath.endsWith('.js')) {
    chunks = chunkVanillaJs(content, filePath);
  } else if (filePath.endsWith('.css')) {
    chunks = chunkCss(content, filePath);
  } else {
    // Basic chunking for other files
    const splitContent = content.split(/\n\s*\n/);
    chunks = splitContent
      .map((c) => ({
        content: c.trim(),
        filePath,
        cssLinks: '[]',
      }))
      .filter((c) => c.content);
  }

  const recordsToInsert = [];

  for (const chunk of chunks) {
    const hash = await getHash(chunk.content);

    let exists = false;
    try {
      const existing = await table.query().where(`hash = '${hash}'`).limit(1).execute();
      if (existing && existing.length > 0) exists = true;
    } catch (_e) {
      // Ignore errors when table doesn't support complex queries
    }

    if (!exists) {
      // Generate embedding
      const output = await extractor(chunk.content, { pooling: 'mean', normalize: true });
      const embedding = Array.from(output.data);

      recordsToInsert.push({
        vector: embedding,
        filePath: chunk.filePath,
        content: chunk.content,
        hash,
        cssLinks: chunk.cssLinks || '[]',
      });
    }
  }

  if (recordsToInsert.length > 0) {
    await table.add(recordsToInsert);
  }
}

async function search({ query, k = 5 }) {
  await init();

  // Embed query
  const output = await extractor(query, { pooling: 'mean', normalize: true });
  const embedding = Array.from(output.data);

  // Search lancedb
  const results = await table.search(embedding).limit(k).execute();
  return results;
}

self.addEventListener('message', async (event) => {
  const { type, payload, id } = event.data;

  try {
    if (type === 'INDEX_FILE') {
      await indexFile(payload);
      self.postMessage({ id, type: 'INDEX_FILE_SUCCESS' });
    } else if (type === 'SEARCH') {
      const results = await search(payload);
      self.postMessage({ id, type: 'SEARCH_SUCCESS', payload: results });
    }
  } catch (error) {
    self.postMessage({ id, type: 'ERROR', error: error.message });
  }
});
