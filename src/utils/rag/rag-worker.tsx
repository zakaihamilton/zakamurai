import { extractSymbolHeader, splitIntoChunks } from './rag-chunker';
import {
  type RagInferenceDevice,
  disposeExtractor,
  loadTransformers,
  resetTransformers,
} from './rag-embedder';
import {
  indexFile,
  purgeIndex,
  resetSearchRuntime,
  search,
  syncWorkspace,
} from './rag-search-engine';

self.addEventListener('message', async (event: MessageEvent) => {
  const { type, payload, id } = event.data as {
    type: string;
    payload: {
      filePath?: string;
      content?: string;
      files?: Record<string, string>;
      query?: string;
      k?: number;
      device?: RagInferenceDevice;
    };
    id: number;
  };

  try {
    if (type === 'INDEX_FILE') {
      await indexFile({
        filePath: payload.filePath || '',
        content: payload.content || '',
        device: payload.device,
      });
      self.postMessage({ id, type: 'INDEX_FILE_SUCCESS' });
    } else if (type === 'SYNC_WORKSPACE') {
      const summary = await syncWorkspace({
        files: payload.files || {},
        device: payload.device,
      });
      self.postMessage({ id, type: 'SYNC_WORKSPACE_SUCCESS', payload: summary });
    } else if (type === 'SEARCH') {
      const results = await search({
        query: payload.query || '',
        k: payload.k,
        device: payload.device,
      });
      self.postMessage({ id, type: 'SEARCH_SUCCESS', payload: results });
    } else if (type === 'UNLOAD_MODEL') {
      await disposeExtractor();
      self.postMessage({ id, type: 'UNLOAD_MODEL_SUCCESS' });
    } else if (type === 'PURGE_INDEX') {
      await purgeIndex();
      self.postMessage({ id, type: 'PURGE_INDEX_SUCCESS' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[RAG] Worker error:', error);
    self.postMessage({ id, type: 'ERROR', error: message });
  }
});

export const __testables = {
  loadTransformers,
  splitIntoChunks,
  extractSymbolHeader,
  resetTransformers,
  resetRuntime: resetSearchRuntime,
};
