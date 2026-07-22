import { AppState } from '@/components/App/AppState';
import { EditorState } from '@/components/App/Views/EditorArea';
import { useEffect, useRef } from 'react';

const INDEX_DEBOUNCE_MS = 1500;

/**
 * Initialize the RAG worker and keep the index aligned with the mounted workspace
 * (editor buffers + local FS snapshot), not OPFS alone.
 * Heavy deps (transformers via rag-worker) load only when indexing starts.
 */
export function useRagIndexer() {
  const { fs } = AppState.useState(['fs']);
  const editorState = EditorState.useState(['fileContents']);
  const bootstrappedRef = useRef(false);
  const debounceRef = useRef(null);
  const lastFingerprintRef = useRef('');
  const fileContentsRef = useRef(editorState.fileContents);
  fileContentsRef.current = editorState.fileContents;

  useEffect(() => {
    let cancelled = false;

    const initRag = async () => {
      try {
        // Start the timeout before dynamic imports so hung imports are covered.
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('RAG Init Timeout')), 10000),
        );
        const initWork = (async () => {
          const [{ ragSearch }, { collectWorkspaceFiles }] = await Promise.all([
            import('@/utils/rag/search-utility'),
            import('@/components/AI/Agent/Snapshot'),
          ]);
          await ragSearch.init();
          return { ragSearch, collectWorkspaceFiles };
        })();
        const { ragSearch, collectWorkspaceFiles } = await Promise.race([initWork, timeout]);
        if (cancelled || !fs?.isReady) return;
        console.log('[RAG] Indexer initialized successfully.');

        if (!bootstrappedRef.current) {
          bootstrappedRef.current = true;
          const files = await collectWorkspaceFiles(fs, fileContentsRef.current || {});
          if (cancelled) return;
          await ragSearch.indexWorkspaceFiles(files);
          lastFingerprintRef.current = fingerprintContents(fileContentsRef.current);
          console.log('[RAG] Workspace bootstrap index complete.');
        }
      } catch (error) {
        console.error('[RAG] Failed to initialize indexer:', error);
      }
    };

    initRag();
    return () => {
      cancelled = true;
    };
  }, [fs, fs?.isReady]);

  useEffect(() => {
    if (!fs?.isReady) return undefined;
    const nextFingerprint = fingerprintContents(editorState.fileContents);
    if (nextFingerprint === lastFingerprintRef.current) return undefined;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { ragSearch } = await import('@/utils/rag/search-utility');
        const files = editorState.fileContents || {};
        await ragSearch.indexWorkspaceFiles(files);
        lastFingerprintRef.current = nextFingerprint;
      } catch (error) {
        console.error('[RAG] Failed to sync workspace index:', error);
      }
    }, INDEX_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [editorState.fileContents, fs?.isReady]);
}

function fingerprintContents(fileContents = {}) {
  const keys = Object.keys(fileContents).sort();
  return keys.map((key) => `${key}:${String(fileContents[key] ?? '').length}`).join('|');
}
