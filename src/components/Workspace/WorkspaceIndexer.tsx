import { EditorState } from '@/components/App/Views/EditorArea';
import {
  createEffectivePreviewFileContentsSnapshot,
  mergeWorkspaceDiskFiles,
} from '@/components/App/Views/EditorArea/EditorBuffers';
import { useFileSystem } from '@/components/Storage';
import type { WorkspaceSkippedFile } from '@/types/domain-types';
import {
  WorkspaceIndexController,
  hashContent,
  shouldSkipPath,
} from '@/utils/workspace/index-controller';
import { useEffect, useRef } from 'react';
import { WorkspaceHealthState, WorkspaceProfileState } from './WorkspaceState';

const INDEX_DEBOUNCE_MS = 3000;
const workspaceIndex = new WorkspaceIndexController();

export function getWorkspaceIndex() {
  return workspaceIndex;
}

/** Keeps the code-intelligence catalog in sync without copying unchanged files to a worker. */
export function useWorkspaceIndexer() {
  const fs = useFileSystem();
  const { isReady, version, mode, rootHandle } = fs;
  const editorState = EditorState.useState([
    'fileContents',
    'dirtyBufferContents',
    'pendingDiffs',
    'pendingDeletions',
  ]);
  const profileState = WorkspaceProfileState.useState(['include', 'exclude', 'maxFileBytes']);
  const { include = [], exclude = [], maxFileBytes = 512 * 1024 } = profileState || {};
  const health = WorkspaceHealthState.useState();
  const hashesRef = useRef(new Map<string, string>());
  const diskFilesRef = useRef<Record<string, string> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanGenerationRef = useRef(0);
  const scannedVersionRef = useRef<number | null>(null);
  const scannedRootHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  useEffect(() => {
    return () => workspaceIndex.dispose();
  }, []);

  useEffect(() => {
    if (!isReady || !editorState || !health) return undefined;
    if (timerRef.current) clearTimeout(timerRef.current);
    const generation = ++scanGenerationRef.current;
    let cancelled = false;
    timerRef.current = setTimeout(async () => {
      try {
        const editorFiles = createEffectivePreviewFileContentsSnapshot(editorState);
        health((draft) => {
          draft.status = 'indexing';
          draft.error = null;
        });
        const { collectWorkspaceFiles } = await import('@/components/AI/Agent/Snapshot');
        const skippedFiles: WorkspaceSkippedFile[] = [];
        let files: Record<string, string>;
        if (mode === 'local' && rootHandle) {
          const shouldScanDisk =
            scannedVersionRef.current !== version || scannedRootHandleRef.current !== rootHandle;
          if (shouldScanDisk || !diskFilesRef.current) {
            const diskFiles = await collectWorkspaceFiles(
              { mode, rootHandle },
              {},
              {
                onSkipped: (item) => skippedFiles.push(item),
              },
            );
            if (cancelled || generation !== scanGenerationRef.current) return;
            diskFilesRef.current = diskFiles;
            scannedVersionRef.current = version;
            scannedRootHandleRef.current = rootHandle;
          }
          files = mergeWorkspaceDiskFiles(diskFilesRef.current || {}, editorState);
        } else {
          files = editorFiles;
          diskFilesRef.current = null;
          scannedVersionRef.current = null;
          scannedRootHandleRef.current = null;
        }
        if (cancelled || generation !== scanGenerationRef.current) return;
        const nextPaths = new Set(Object.keys(files));
        const entries = [];
        const nextHashes = new Map(hashesRef.current);
        for (const [path, content] of Object.entries(files)) {
          const skipReason = shouldSkipPath(path, { include, exclude });
          if (skipReason) {
            skippedFiles.push({ path, reason: skipReason });
            if (nextHashes.has(path)) {
              entries.push({ path, deleted: true });
              nextHashes.delete(path);
            }
            continue;
          }
          const bytes = new Blob([content]).size;
          if (bytes > maxFileBytes) {
            skippedFiles.push({ path, reason: 'file exceeds index size limit' });
            if (nextHashes.has(path)) {
              entries.push({ path, deleted: true });
              nextHashes.delete(path);
            }
            continue;
          }
          const hash = await hashContent(content);
          if (cancelled || generation !== scanGenerationRef.current) return;
          if (nextHashes.get(path) !== hash) entries.push({ path, content, hash, bytes });
          nextHashes.set(path, hash);
        }
        for (const path of nextHashes.keys()) {
          if (!nextPaths.has(path)) {
            entries.push({ path, deleted: true });
            nextHashes.delete(path);
          }
        }
        if (cancelled || generation !== scanGenerationRef.current) return;
        if (entries.length) await workspaceIndex.applyFileChanges(entries);
        if (cancelled || generation !== scanGenerationRef.current) return;
        hashesRef.current = nextHashes;
        const indexHealth = (await workspaceIndex.getHealth()) as {
          totalFiles: number;
          indexedBytes: number;
        };
        if (cancelled || generation !== scanGenerationRef.current) return;
        health((draft) => {
          draft.status = 'ready';
          draft.totalFiles = Object.keys(files).length;
          draft.indexedFiles = indexHealth.totalFiles;
          draft.indexedBytes = indexHealth.indexedBytes;
          draft.skippedFiles = skippedFiles;
          draft.lastIndexedAt = Date.now();
        });
      } catch (error) {
        if (cancelled || generation !== scanGenerationRef.current) return;
        health((draft) => {
          draft.status = 'error';
          draft.error = error instanceof Error ? error.message : String(error);
        });
      }
    }, INDEX_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    editorState,
    editorState?.fileContents,
    editorState?.dirtyBufferContents,
    editorState?.pendingDiffs,
    editorState?.pendingDeletions,
    isReady,
    version,
    mode,
    rootHandle,
    health,
    include,
    exclude,
    maxFileBytes,
  ]);
}
