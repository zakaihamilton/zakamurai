import { RagState } from '@/components/AI/RagState';
import { EditorState } from '@/components/App/Views/EditorArea';
import { useFileSystem } from '@/components/Storage';
import { useEffect, useRef } from 'react';

const INDEX_DEBOUNCE_MS = 1500;

/**
 * Initialize the RAG worker and keep the index aligned with the mounted workspace
 * (editor buffers + local FS snapshot), not OPFS alone.
 * Heavy deps (transformers via rag-worker) load only when indexing starts.
 */
export function useRagIndexer() {
  const fs = useFileSystem();
  const editorState = EditorState.useState(['fileContents']);
  const ragState = RagState.useState();
  const bootstrappedRef = useRef(false);
  const debounceRef = useRef(null);
  const lastFingerprintRef = useRef('');
  const fileContentsRef = useRef(editorState.fileContents);
  fileContentsRef.current = editorState.fileContents;

  useEffect(() => {
    let cancelled = false;

    const initRag = async () => {
      try {
        ragState((draft) => {
          draft.status = 'initializing';
          draft.error = null;
        });
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
          ragState((draft) => {
            draft.status = 'indexing';
          });
          const files = await collectWorkspaceFiles(fs, fileContentsRef.current || {});
          if (cancelled) return;
          await ragSearch.indexWorkspaceFiles(files);
          const fingerprint = fingerprintContents(fileContentsRef.current);
          lastFingerprintRef.current = fingerprint;
          ragState((draft) => {
            draft.status = 'ready';
            draft.error = null;
            draft.indexedFileCount = Object.keys(files || {}).length;
            draft.lastIndexedAt = Date.now();
            draft.lastFingerprint = fingerprint;
          });
          console.log('[RAG] Workspace bootstrap index complete.');
        }
      } catch (error) {
        console.error('[RAG] Failed to initialize indexer:', error);
        ragState((draft) => {
          draft.status = 'error';
          draft.error = error?.message || String(error);
        });
      }
    };

    initRag();
    return () => {
      cancelled = true;
    };
  }, [fs, fs?.isReady, ragState]);

  useEffect(() => {
    if (!fs?.isReady) return undefined;
    const nextFingerprint = fingerprintContents(editorState.fileContents);
    if (nextFingerprint === lastFingerprintRef.current) return undefined;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        ragState((draft) => {
          draft.status = 'indexing';
          draft.error = null;
        });
        const { ragSearch } = await import('@/utils/rag/search-utility');
        const files = editorState.fileContents || {};
        await ragSearch.indexWorkspaceFiles(files);
        lastFingerprintRef.current = nextFingerprint;
        ragState((draft) => {
          draft.status = 'ready';
          draft.indexedFileCount = Object.keys(files).length;
          draft.lastIndexedAt = Date.now();
          draft.lastFingerprint = nextFingerprint;
        });
      } catch (error) {
        console.error('[RAG] Failed to sync workspace index:', error);
        ragState((draft) => {
          draft.status = 'error';
          draft.error = error?.message || String(error);
        });
      }
    }, INDEX_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [editorState.fileContents, fs?.isReady, ragState]);
}

function hashString(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export function fingerprintContents(fileContents = {}) {
  const keys = Object.keys(fileContents).sort();
  return keys
    .map((key) => {
      const content = String(fileContents[key] ?? '');
      return `${key}:${content.length}:${hashString(content)}`;
    })
    .join('|');
}
