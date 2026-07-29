import { EditorState } from '@/components/App/Views/EditorArea';
import { useFileSystem } from '@/components/Storage';
import type { WorkspaceSkippedFile } from '@/components/state/domain-types';
import {
  WorkspaceIndexController,
  hashContent,
  shouldSkipPath,
} from '@/utils/workspace/index-controller';
import { useEffect, useRef } from 'react';
import { WorkspaceHealthState, WorkspaceProfileState } from './WorkspaceState';

const INDEX_DEBOUNCE_MS = 600;
const workspaceIndex = new WorkspaceIndexController();

export function getWorkspaceIndex() {
  return workspaceIndex;
}

/** Keeps the code-intelligence catalog in sync without copying unchanged files to a worker. */
export function useWorkspaceIndexer() {
  const fs = useFileSystem();
  const { isReady, version, mode, rootHandle } = fs;
  const editorState = EditorState.useState(['fileContents']);
  const profileState = WorkspaceProfileState.useState(['include', 'exclude', 'maxFileBytes']);
  const { exclude = [], maxFileBytes = 512 * 1024 } = profileState || {};
  const health = WorkspaceHealthState.useState();
  const hashesRef = useRef(new Map<string, string>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scannedVersionRef = useRef<number | null>(null);

  useEffect(() => {
    return () => workspaceIndex.dispose();
  }, []);

  useEffect(() => {
    if (!isReady || !editorState || !health) return undefined;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        health((draft) => {
          draft.status = 'indexing';
          draft.error = null;
        });
        const { collectWorkspaceFiles } = await import('@/components/AI/Agent/Snapshot');
        const skippedFiles: WorkspaceSkippedFile[] = [];
        const shouldScanDisk = scannedVersionRef.current !== version;
        const files = shouldScanDisk
          ? await collectWorkspaceFiles(
              { mode: mode ?? 'local', rootHandle },
              editorState.fileContents || {},
              {
                onSkipped: (item) => skippedFiles.push(item),
              },
            )
          : editorState.fileContents || {};
        scannedVersionRef.current = version;
        const nextPaths = new Set(Object.keys(files));
        const entries = [];
        for (const [path, content] of Object.entries(files)) {
          const skipReason = shouldSkipPath(path, { exclude });
          if (skipReason) {
            skippedFiles.push({ path, reason: skipReason });
            if (hashesRef.current.has(path)) {
              entries.push({ path, deleted: true });
              hashesRef.current.delete(path);
            }
            continue;
          }
          const bytes = new Blob([content]).size;
          if (bytes > maxFileBytes) {
            skippedFiles.push({ path, reason: 'file exceeds index size limit' });
            if (hashesRef.current.has(path)) {
              entries.push({ path, deleted: true });
              hashesRef.current.delete(path);
            }
            continue;
          }
          const hash = await hashContent(content);
          if (hashesRef.current.get(path) !== hash) entries.push({ path, content, hash, bytes });
          hashesRef.current.set(path, hash);
        }
        for (const path of hashesRef.current.keys()) {
          if (!nextPaths.has(path)) {
            entries.push({ path, deleted: true });
            hashesRef.current.delete(path);
          }
        }
        if (entries.length) await workspaceIndex.applyFileChanges(entries);
        const indexHealth = (await workspaceIndex.getHealth()) as {
          totalFiles: number;
          indexedBytes: number;
        };
        health((draft) => {
          draft.status = 'ready';
          draft.totalFiles = Object.keys(files).length;
          draft.indexedFiles = indexHealth.totalFiles;
          draft.indexedBytes = indexHealth.indexedBytes;
          draft.skippedFiles = skippedFiles;
          draft.lastIndexedAt = Date.now();
        });
      } catch (error) {
        health((draft) => {
          draft.status = 'error';
          draft.error = error instanceof Error ? error.message : String(error);
        });
      }
    }, INDEX_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    editorState,
    editorState?.fileContents,
    isReady,
    version,
    mode,
    rootHandle,
    health,
    exclude,
    maxFileBytes,
  ]);
}
