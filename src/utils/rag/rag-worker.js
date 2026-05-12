import { env, pipeline } from '@huggingface/transformers';
// import * as lancedb from '@lancedb/lancedb';

// Configure transformers.js for WebGPU and browser environment
env.allowLocalModels = false;
env.useBrowserCache = true;
// Configure WASM paths for both ONNX and fallback
try {
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.wasmPaths = '/wasm/';
  }
} catch (e) {
  console.warn('[RAG] Failed to set backend wasmPaths:', e);
}
env.wasmPaths = '/wasm/';

let extractor;

async function init() {
  if (!extractor) {
    try {
        extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        device: 'webgpu',
        dtype: 'fp16',
        });
    } catch (e) {
        console.warn('[RAG] WebGPU failed, falling back to CPU:', e);
        extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
            device: 'cpu',
        });
    }
  }
}

async function indexFile({ filePath, content }) {
  await init();
  // Mock indexing: do nothing for now
  console.log('[RAG] Mock indexing for:', filePath);
}

async function search({ query, k = 5 }) {
  await init();
  // Mock search: return empty results
  console.log('[RAG] Mock searching for:', query);
  return [];
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
