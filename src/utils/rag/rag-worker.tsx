type RagChunk = {
  vector: Float32Array;
  filePath: string;
  content: string;
  hash: string;
  timestamp: number;
};

type SearchResult = {
  filePath: string;
  content: string;
  hash: string;
  timestamp: number;
  score: number;
};

type FeatureExtractor = (
  text: string,
  options: { pooling: string; normalize: boolean },
) => Promise<{ data: Float32Array | number[] }>;

let extractor: FeatureExtractor | undefined;
let index: RagChunk[] = [];
let hashes = new Set<string>();
const DB_NAME = 'zakamurai-rag-data.json';
const MAX_INDEX_ITEMS = 1500;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_CHUNK_CHARS = 2000;

let transformersPromise: Promise<unknown> | undefined;

async function loadTransformers(): Promise<{
  pipeline: (
    task: string,
    model: string,
    options: Record<string, unknown>,
  ) => Promise<FeatureExtractor>;
}> {
  if (!transformersPromise) {
    transformersPromise = (async () => {
      const { env, pipeline } = await import('@huggingface/transformers');

      (env as { allowLocalModels: boolean }).allowLocalModels = false;
      (env as { useBrowserCache: boolean }).useBrowserCache = true;

      const envRecord = env as {
        backends?: { onnx?: { wasm: { wasmPaths: string } } };
        wasmPaths?: string;
      };
      if (envRecord.backends?.onnx) {
        envRecord.backends.onnx.wasm.wasmPaths = '/wasm/';
        console.log('[RAG] Set backend wasmPaths to:', envRecord.backends.onnx.wasm.wasmPaths);
      }
      envRecord.wasmPaths = '/wasm/';
      console.log('[RAG] Initialized with wasmPaths:', envRecord.wasmPaths);

      return { env, pipeline };
    })().catch((error) => {
      transformersPromise = undefined;
      throw error;
    });
  }
  return transformersPromise as Promise<{
    pipeline: (
      task: string,
      model: string,
      options: Record<string, unknown>,
    ) => Promise<FeatureExtractor>;
  }>;
}

function cosineSimilarity(v1: Float32Array | number[], v2: Float32Array): number {
  let dotProduct = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
  }
  return dotProduct;
}

async function loadIndex(): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(DB_NAME, { create: true });
    const file = await fileHandle.getFile();
    const text = await file.text();
    if (text) {
      index = (JSON.parse(text) as Array<Omit<RagChunk, 'vector'> & { vector: number[] }>)
        .slice(-MAX_INDEX_ITEMS)
        .map((item) => ({
          ...item,
          vector: Float32Array.from(item.vector || []),
        }));
      hashes = new Set(index.map((item) => item.hash));
      console.log(`[RAG] Loaded ${index.length} chunks from OPFS.`);
    }
  } catch (e) {
    console.error('[RAG] Failed to load index:', e);
    index = [];
    hashes = new Set();
  }
}

async function saveIndex(): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(DB_NAME, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(
      JSON.stringify(
        index.map((item) => ({
          ...item,
          vector: Array.from(item.vector),
        })),
      ),
    );
    await writable.close();
  } catch (e) {
    console.error('[RAG] Failed to save index:', e);
  }
}

async function init(): Promise<void> {
  if (!extractor) {
    const { pipeline } = await loadTransformers();
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

async function getHash(text: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function indexFile({
  filePath,
  content,
}: { filePath: string; content: string }): Promise<void> {
  await init();

  if (!content || content.length > MAX_FILE_BYTES) {
    return;
  }

  const chunks = content
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 10)
    .map((chunk) => chunk.slice(0, MAX_CHUNK_CHARS));

  let added = 0;
  for (const chunkContent of chunks) {
    const hash = await getHash(chunkContent);

    if (hashes.has(hash)) continue;

    if (!extractor) return;
    const output = await extractor(chunkContent, { pooling: 'mean', normalize: true });
    const vector = Float32Array.from(output.data);

    index.push({
      vector,
      filePath,
      content: chunkContent,
      hash,
      timestamp: Date.now(),
    });
    hashes.add(hash);

    while (index.length > MAX_INDEX_ITEMS) {
      const removed = index.shift();
      if (removed) hashes.delete(removed.hash);
    }

    added++;
  }

  if (added > 0) {
    await saveIndex();
    console.log(`[RAG] Indexed ${added} new chunks from ${filePath}.`);
  }
}

async function search({ query, k = 5 }: { query: string; k?: number }): Promise<SearchResult[]> {
  await init();

  if (!extractor) return [];
  const output = await extractor(query, { pooling: 'mean', normalize: true });
  const queryVector = Float32Array.from(output.data);

  const results = index
    .map((item) => ({
      filePath: item.filePath,
      content: item.content,
      hash: item.hash,
      timestamp: item.timestamp,
      score: cosineSimilarity(queryVector, item.vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  return results;
}

self.addEventListener('message', async (event: MessageEvent) => {
  const { type, payload, id } = event.data as {
    type: string;
    payload: { filePath?: string; content?: string; query?: string; k?: number };
    id: number;
  };

  try {
    if (type === 'INDEX_FILE') {
      await indexFile({
        filePath: payload.filePath || '',
        content: payload.content || '',
      });
      self.postMessage({ id, type: 'INDEX_FILE_SUCCESS' });
    } else if (type === 'SEARCH') {
      const results = await search({ query: payload.query || '', k: payload.k });
      self.postMessage({ id, type: 'SEARCH_SUCCESS', payload: results });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[RAG] Worker error:', error);
    self.postMessage({ id, type: 'ERROR', error: message });
  }
});

export const __testables = {
  loadTransformers,
  resetTransformers() {
    transformersPromise = undefined;
  },
};
