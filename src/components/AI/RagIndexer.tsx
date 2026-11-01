import { RagState } from '@/components/AI/RagState';
import type { FileMap } from '@/components/AI/types';
import { AppState } from '@/components/App/AppState';
import { EditorState } from '@/components/App/Views/EditorArea';
import {
  createEffectivePreviewFileContentsSnapshot,
  mergeWorkspaceDiskFiles,
} from '@/components/App/Views/EditorArea/EditorBuffers';
import type { EditorBufferSource } from '@/components/App/Views/EditorArea/EditorBuffers';
import { reportDiagnostic } from '@/components/Diagnostics';
import { useFileSystem } from '@/components/Storage';
import { WorkspaceProfileState } from '@/components/Workspace/WorkspaceState';
import type { RagIndexSyncSummary } from '@/utils/rag/indexer-controller';
import { selectRagWorkspaceFilesWithSummary } from '@/utils/rag/rag-files';
import { useCallback, useEffect, useRef } from 'react';

const INDEX_DEBOUNCE_MS = 3000;
const EMPTY_EXCLUDED_PATHS: string[] = [];

function getIndexWarning(
  summary?: RagIndexSyncSummary,
  filteredSkippedFileCount = 0,
): string | null {
  const skippedFileCount = (summary?.skippedFileCount ?? 0) + filteredSkippedFileCount;
  const skippedChunkCount = summary?.skippedChunkCount ?? 0;
  const omitted = [
    skippedFileCount > 0 ? `${skippedFileCount} file${skippedFileCount === 1 ? '' : 's'}` : null,
    skippedChunkCount > 0
      ? `${skippedChunkCount} chunk${skippedChunkCount === 1 ? '' : 's'}`
      : null,
  ].filter((value): value is string => value !== null);

  return omitted.length > 0
    ? `RAG index is partial: ${omitted.join(' and ')} omitted by workspace indexing limits.`
    : null;
}

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
  const appState = AppState.useState(['workspaceEpoch']);
  const workspaceEpoch = appState?.workspaceEpoch || 0;
  const ragState = RagState.useState();
  const workspaceProfile = WorkspaceProfileState.useState(['include', 'exclude', 'maxFileBytes']);
  const includedPaths = workspaceProfile?.include || EMPTY_EXCLUDED_PATHS;
  const excludedPaths = workspaceProfile?.exclude || EMPTY_EXCLUDED_PATHS;
  const maxFileBytes = workspaceProfile?.maxFileBytes;
  const bootstrappedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFingerprintRef = useRef('');
  const lastWorkspaceEpochRef = useRef(workspaceEpoch);
  const workspaceEpochRef = useRef(workspaceEpoch);
  workspaceEpochRef.current = workspaceEpoch;
  const syncGenerationRef = useRef(0);
  const lastIndexSummaryRef = useRef<RagIndexSyncSummary | undefined>(undefined);
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
  const selectIndexableFiles = useCallback(
    (files: FileMap) =>
      selectRagWorkspaceFilesWithSummary(files, {
        include: includedPaths,
        exclude: excludedPaths,
        maxFileBytes,
      }),
    [excludedPaths, includedPaths, maxFileBytes],
  );

  useEffect(() => {
    if (lastWorkspaceEpochRef.current === workspaceEpoch) return;
    lastWorkspaceEpochRef.current = workspaceEpoch;
    bootstrappedRef.current = false;
    lastFingerprintRef.current = '';
    lastIndexSummaryRef.current = undefined;
    ragState?.((draft) => {
      draft.status = 'initializing';
      draft.error = null;
      draft.warning = null;
    });
  }, [ragState, workspaceEpoch]);

  useEffect(() => {
    if (!ragState) return undefined;
    let cancelled = false;

    const initRag = async () => {
      const initWorkspaceEpoch = workspaceEpoch;
      try {
        ragState((draft) => {
          draft.status = 'initializing';
          draft.error = null;
          draft.warning = null;
        });
        // Start the timeout before dynamic imports so hung imports are covered.
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('RAG Init Timeout')), 10000);
        });
        const initWork = (async () => {
          const [{ ragSearch }, { collectWorkspaceFiles }] = await Promise.all([
            import('@/utils/rag/search-utility'),
            import('@/components/AI/Agent/Snapshot'),
          ]);
          await ragSearch.init();
          return { ragSearch, collectWorkspaceFiles };
        })();
        let initialized: Awaited<typeof initWork>;
        try {
          initialized = await Promise.race([initWork, timeout]);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
        const { ragSearch, collectWorkspaceFiles } = initialized;
        if (cancelled || workspaceEpochRef.current !== initWorkspaceEpoch || !fs?.isReady) return;
        console.log('[RAG] Indexer initialized successfully.');

        if (!bootstrappedRef.current) {
          ragState((draft) => {
            draft.status = 'indexing';
            draft.warning = null;
          });
          const bootstrapSyncGeneration = syncGenerationRef.current;
          const collectedFiles = await collectCurrentFiles(
            collectWorkspaceFiles,
            editorStateRef.current,
          );
          if (cancelled || workspaceEpochRef.current !== initWorkspaceEpoch) return;
          const selection = selectIndexableFiles(collectedFiles);
          const summary = await ragSearch.indexWorkspaceFiles(selection.files);
          if (
            cancelled ||
            workspaceEpochRef.current !== initWorkspaceEpoch ||
            bootstrapSyncGeneration !== syncGenerationRef.current
          ) {
            return;
          }
          lastIndexSummaryRef.current = summary;
          const fingerprint = fingerprintContents(selection.files);
          lastFingerprintRef.current = fingerprint;
          bootstrappedRef.current = true;
          const warning = getIndexWarning(summary, selection.skippedFileCount);
          ragState((draft) => {
            draft.status = warning ? 'partial' : 'ready';
            draft.error = null;
            draft.warning = warning;
            draft.indexedFileCount =
              summary?.indexedFileCount ?? Object.keys(selection.files).length;
            draft.lastIndexedAt = Date.now();
            draft.lastFingerprint = fingerprint;
          });
          console.log('[RAG] Workspace bootstrap index complete.');
        }
      } catch (error) {
        if (cancelled || workspaceEpochRef.current !== initWorkspaceEpoch) return;
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
          draft.warning = null;
        });
      }
    };

    initRag();
    return () => {
      cancelled = true;
    };
  }, [collectCurrentFiles, fs, fs?.isReady, ragState, selectIndexableFiles, workspaceEpoch]);

  useEffect(() => {
    if (!fs?.isReady || !editorState || !ragState) return undefined;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const generation = ++syncGenerationRef.current;
    const syncWorkspaceEpoch = workspaceEpoch;
    let cancelled = false;
    if (bootstrappedRef.current) {
      ragState((draft) => {
        draft.status = 'indexing';
        draft.error = null;
      });
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const { collectWorkspaceFiles } = await import('@/components/AI/Agent/Snapshot');
        const collectedFiles = await collectCurrentFiles(
          collectWorkspaceFiles,
          editorStateRef.current,
        );
        if (
          cancelled ||
          workspaceEpochRef.current !== syncWorkspaceEpoch ||
          generation !== syncGenerationRef.current
        ) {
          return;
        }
        const selection = selectIndexableFiles(collectedFiles);
        const nextFingerprint = fingerprintContents(selection.files);
        if (nextFingerprint === lastFingerprintRef.current) {
          const warning = getIndexWarning(lastIndexSummaryRef.current, selection.skippedFileCount);
          ragState((draft) => {
            draft.status = warning ? 'partial' : 'ready';
            draft.error = null;
            draft.warning = warning;
          });
          return;
        }
        const { ragSearch } = await import('@/utils/rag/search-utility');
        const summary = await ragSearch.indexWorkspaceFiles(selection.files);
        if (
          cancelled ||
          workspaceEpochRef.current !== syncWorkspaceEpoch ||
          generation !== syncGenerationRef.current
        ) {
          return;
        }
        lastIndexSummaryRef.current = summary;
        bootstrappedRef.current = true;
        lastFingerprintRef.current = nextFingerprint;
        const warning = getIndexWarning(summary, selection.skippedFileCount);
        ragState((draft) => {
          draft.status = warning ? 'partial' : 'ready';
          draft.error = null;
          draft.warning = warning;
          draft.indexedFileCount = summary?.indexedFileCount ?? Object.keys(selection.files).length;
          draft.lastIndexedAt = Date.now();
          draft.lastFingerprint = nextFingerprint;
        });
      } catch (error) {
        if (
          cancelled ||
          workspaceEpochRef.current !== syncWorkspaceEpoch ||
          generation !== syncGenerationRef.current
        ) {
          return;
        }
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
          draft.warning = null;
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
    workspaceEpoch,
    collectCurrentFiles,
    selectIndexableFiles,
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
