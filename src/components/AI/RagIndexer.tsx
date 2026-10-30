import { RagState } from '@/components/AI/RagState';
import type { FileMap } from '@/components/AI/types';
import { EditorState } from '@/components/App/Views/EditorArea';
import {
  createEffectivePreviewFileContentsSnapshot,
  mergeWorkspaceDiskFiles,
} from '@/components/App/Views/EditorArea/EditorBuffers';
import type { EditorBufferSource } from '@/components/App/Views/EditorArea/EditorBuffers';
import { reportDiagnostic } from '@/components/Diagnostics';
import { useFileSystem } from '@/components/Storage';
import { useCallback, useEffect, useRef } from 'react';

const INDEX_DEBOUNCE_MS = 3000;

/**
 * Initialize the RAG worker and keep the index aligned with the mounted workspace
 * (editor buffers + local FS snapshot), not OPFS alone.
 * Heavy deps (transformers via rag-worker) load only when indexing starts.
 */
export function useRagIndexer() {
  const fs = useFileSystem();
  const editorState = EditorState.useState([
    'fileContents',
    'dirtyBufferContents',
    'pendingDiffs',
    'pendingDeletions',
  ]);
  const ragState = RagState.useState();
  const bootstrappedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFingerprintRef = useRef('');
  const syncGenerationRef = useRef(0);
  const diskSnapshotRef = useRef<{
    files: FileMap | null;
    rootHandle: FileSystemDirectoryHandle | null;
    version: number | null;
  }>({ files: null, rootHandle: null, version: null });
  const editorStateRef = useRef(editorState);
  editorStateRef.current = editorState;

  const collectCurrentFiles = useCallback(
    async (
      collectWorkspaceFiles: typeof import('@/components/AI/Agent/Snapshot').collectWorkspaceFiles,
      nextEditorState: EditorBufferSource | null | undefined,
    ) => {
      if (fs.mode === 'local' && fs.rootHandle) {
        const cached = diskSnapshotRef.current;
        if (!cached.files || cached.rootHandle !== fs.rootHandle || cached.version !== fs.version) {
          cached.files = await collectWorkspaceFiles(
            { mode: 'local', rootHandle: fs.rootHandle },
            {},
          );
          cached.rootHandle = fs.rootHandle;
          cached.version = fs.version;
        }
        return mergeWorkspaceDiskFiles(cached.files, nextEditorState);
      }
      diskSnapshotRef.current = { files: null, rootHandle: null, version: null };
      return createEffectivePreviewFileContentsSnapshot(nextEditorState);
    },
    [fs.mode, fs.rootHandle, fs.version],
  );

  useEffect(() => {
    if (!ragState) return undefined;
    let cancelled = false;

    const initRag = async () => {
      try {
        ragState((draft) => {
          draft.status = 'initializing';
          draft.error = null;
        });
        // Start the timeout before dynamic imports so hung imports are covered.
        const timeout = new Promise<never>((_, reject) =>
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
          const files = await collectCurrentFiles(collectWorkspaceFiles, editorStateRef.current);
          if (cancelled) return;
          await ragSearch.indexWorkspaceFiles(files);
          if (cancelled) return;
          const fingerprint = fingerprintContents(files);
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
        if (cancelled) return;
        const err = error as Error;
        console.error('[RAG] Failed to initialize indexer:', error);
        reportDiagnostic({
          source: 'rag',
          severity: 'error',
          message: err?.message || String(error),
        });
        ragState((draft) => {
          draft.status = 'error';
          draft.error = err?.message || String(error);
        });
      }
    };

    initRag();
    return () => {
      cancelled = true;
    };
  }, [collectCurrentFiles, fs, fs?.isReady, ragState]);

  useEffect(() => {
    if (!fs?.isReady || !editorState || !ragState) return undefined;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const generation = ++syncGenerationRef.current;
    let cancelled = false;
    debounceRef.current = setTimeout(async () => {
      try {
        const { collectWorkspaceFiles } = await import('@/components/AI/Agent/Snapshot');
        const files = await collectCurrentFiles(collectWorkspaceFiles, editorStateRef.current);
        if (cancelled || generation !== syncGenerationRef.current) return;
        const nextFingerprint = fingerprintContents(files);
        if (nextFingerprint === lastFingerprintRef.current) return;
        ragState((draft) => {
          draft.status = 'indexing';
          draft.error = null;
        });
        const { ragSearch } = await import('@/utils/rag/search-utility');
        await ragSearch.indexWorkspaceFiles(files);
        if (cancelled || generation !== syncGenerationRef.current) return;
        lastFingerprintRef.current = nextFingerprint;
        ragState((draft) => {
          draft.status = 'ready';
          draft.indexedFileCount = Object.keys(files).length;
          draft.lastIndexedAt = Date.now();
          draft.lastFingerprint = nextFingerprint;
        });
      } catch (error) {
        if (cancelled || generation !== syncGenerationRef.current) return;
        const err = error as Error;
        console.error('[RAG] Failed to sync workspace index:', error);
        reportDiagnostic({
          source: 'rag',
          severity: 'error',
          message: err?.message || String(error),
        });
        ragState((draft) => {
          draft.status = 'error';
          draft.error = err?.message || String(error);
        });
      }
    }, INDEX_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    fs,
    editorState?.dirtyBufferContents,
    editorState?.fileContents,
    editorState?.pendingDiffs,
    editorState?.pendingDeletions,
    fs?.isReady,
    collectCurrentFiles,
    ragState,
    editorState,
  ]);
}

function hashString(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export function fingerprintContents(fileContents: FileMap = {}): string {
  const keys = Object.keys(fileContents).sort();
  return keys
    .map((key) => {
      const content = String(fileContents[key] ?? '');
      return `${key}:${content.length}:${hashString(content)}`;
    })
    .join('|');
}
