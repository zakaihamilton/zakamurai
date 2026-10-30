import { AppState } from '@/components/App/AppState';
import { useCallback, useEffect, useRef } from 'react';
import type { SyncHandlerProps } from './types';

export default function SyncHandler({
  fs,
  filePath,
  localContent,
  state,
  tabState,
}: SyncHandlerProps) {
  const appState = AppState.usePassiveState();
  const workspaceEpoch = appState?.workspaceEpoch || 0;
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStartedAtRef = useRef<number | null>(null);
  const lastSavedContent = useRef(localContent);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  const writeContent = useCallback((handle: FileSystemFileHandle, content: string) => {
    const write = writeQueueRef.current
      .catch(() => {})
      .then(async () => {
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
      });
    writeQueueRef.current = write;
    return write;
  }, []);

  useEffect(() => {
    if (fs.mode !== 'local' || !filePath) return;
    if (state.pendingDiffs?.[filePath] || state.pendingDeletions?.[filePath]) return;
    if (localContent === lastSavedContent.current) return;

    const currentTab = tabState?.openTabs.find((t) => t.id === filePath);
    const handle = currentTab?.fsHandle;
    if (!handle) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const startedAt = saveStartedAtRef.current ?? Date.now();
    saveStartedAtRef.current = startedAt;
    const delay = Math.max(0, Math.min(3000, startedAt + 10000 - Date.now()));
    saveTimeoutRef.current = setTimeout(async () => {
      saveStartedAtRef.current = null;
      try {
        if ((appState?.workspaceEpoch || 0) !== workspaceEpoch) return;
        await writeContent(handle, localContent);
        if ((appState?.workspaceEpoch || 0) !== workspaceEpoch) return;
        lastSavedContent.current = localContent;
        state((draft) => {
          if (draft.dirtyBufferContents?.[filePath] === localContent) {
            draft.fileContents = { ...draft.fileContents, [filePath]: localContent };
            const nextDirty = { ...draft.dirtyBufferContents };
            delete nextDirty[filePath];
            draft.dirtyBufferContents = nextDirty;
          }
          draft.lastSaved = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
        });
        fs.triggerRefresh?.();
        console.log('Saved to FS:', filePath);
      } catch (err) {
        console.error('Failed to save to FS:', err);
      }
    }, delay);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [
    localContent,
    filePath,
    appState,
    workspaceEpoch,
    fs.mode,
    tabState?.openTabs,
    state,
    fs.triggerRefresh,
    state.pendingDiffs,
    state.pendingDeletions,
    state.dirtyBufferContents?.[filePath],
    writeContent,
  ]);

  useEffect(() => {
    if (fs.mode !== 'local' || !filePath) return;

    const flush = async () => {
      if (state.pendingDiffs?.[filePath] || state.pendingDeletions?.[filePath]) return;

      const currentTab = tabState?.openTabs.find((t) => t.id === filePath);
      const handle = currentTab?.fsHandle;
      if (handle && localContent !== lastSavedContent.current) {
        try {
          if ((appState?.workspaceEpoch || 0) !== workspaceEpoch) return;
          await writeContent(handle, localContent);
          if ((appState?.workspaceEpoch || 0) !== workspaceEpoch) return;
          lastSavedContent.current = localContent;
          console.log('Flushed to FS on exit:', filePath);
        } catch (err) {
          console.error('Failed to flush to FS on exit:', err);
        }
      }
    };

    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [
    fs.mode,
    filePath,
    localContent,
    appState,
    workspaceEpoch,
    state.pendingDiffs,
    state.pendingDeletions,
    tabState?.openTabs,
    state,
    writeContent,
  ]);

  return null;
}
