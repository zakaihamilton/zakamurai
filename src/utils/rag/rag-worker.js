import { env, pipeline } from '@huggingface/transformers';

// Configure transformers.js for WebGPU and browser environment
env.allowLocalModels = false;
env.useBrowserCache = true;

// Ensure backends are configured for the browser environment
if (env.backends?.onnx) {
  env.backends.onnx.wasm.wasmPaths = '/wasm/';
  console.log('[RAG] Set backend wasmPaths to:', env.backends.onnx.wasm.wasmPaths);
}
env.wasmPaths = '/wasm/';
console.log('[RAG] Initialized with wasmPaths:', env.wasmPaths);

let extractor;
let index = []; // In-memory cache of chunks and vectors
const DB_NAME = 'zakamurai-rag-data.json';

/**
 * Dot product of two normalized vectors is the cosine similarity.
 */
function cosineSimilarity(v1, v2) {
  let dotProduct = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
  }
  return dotProduct;
}

async function loadIndex() {
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(DB_NAME, { create: true });
    const file = await fileHandle.getFile();
    const text = await file.text();
    if (text) {
      index = JSON.parse(text);
      console.log(`[RAG] Loaded ${index.length} chunks from OPFS.`);
    }
  } catch (e) {
    console.error('[RAG] Failed to load index:', e);
    index = [];
  }
}

async function saveIndex() {
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(DB_NAME, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(index));
    await writable.close();
  } catch (e) {
    console.error('[RAG] Failed to save index:', e);
  }
}

async function init() {
  if (!extractor) {
    try {
      extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        device: 'webgpu',
        dtype: 'fp16',
      });
    } catch (e) {
      console.warn('[RAG] WebGPU failed, falling back to WASM:', e);
      extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        device: 'wasm',
      });
    }
  }
  if (index.length === 0) {
    await loadIndex();
  }
}

async function getHash(text) {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function indexFile({ filePath, content }) {
  await init();

  // Simple chunking strategy: split by double newline
  const chunks = content.split(/\n\s*\n/).filter((c) => c.trim().length > 10);

  let added = 0;
  for (const chunkContent of chunks) {
    const hash = await getHash(chunkContent);

    // Skip if already indexed
    if (index.some((item) => item.hash === hash)) continue;

    const output = await extractor(chunkContent, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data);

    index.push({
      vector,
      filePath,
      content: chunkContent,
      hash,
      timestamp: Date.now(),
    });
    added++;
  }

  if (added > 0) {
    await saveIndex();
    console.log(`[RAG] Indexed ${added} new chunks from ${filePath}.`);
  }
}

async function search({ query, k = 5 }) {
  await init();

  const output = await extractor(query, { pooling: 'mean', normalize: true });
  const queryVector = Array.from(output.data);

  // Brute-force search
  const results = index
    .map((item) => ({
      ...item,
      score: cosineSimilarity(queryVector, item.vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

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
    console.error('[RAG] Worker error:', error);
    self.postMessage({ id, type: 'ERROR', error: error.message });
  }
});
