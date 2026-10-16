import { useEffect, useRef } from 'react';
import { readEffectiveFileContent } from './EditorBuffers';
import type { SyncHandlerProps } from './types';

export default function SyncHandler({
  fs,
  filePath,
  localContent,
  state,
  tabState,
}: SyncHandlerProps) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStartedAtRef = useRef<number | null>(null);
  const lastSavedContent = useRef(localContent);

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
        const writable = await handle.createWritable();
        await writable.write(localContent);
        await writable.close();
        lastSavedContent.current = localContent;
        state((draft) => {
          draft.lastSaved = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
        });
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
    fs.mode,
    tabState?.openTabs,
    state,
    state.pendingDiffs,
    state.pendingDeletions,
    state.dirtyBufferContents?.[filePath],
  ]);

  useEffect(() => {
    if (fs.mode !== 'local' || !filePath) return;

    const flush = async () => {
      if (state.pendingDiffs?.[filePath] || state.pendingDeletions?.[filePath]) return;

      const currentTab = tabState?.openTabs.find((t) => t.id === filePath);
      const handle = currentTab?.fsHandle;
      if (handle && localContent !== readEffectiveFileContent(state, filePath)) {
        try {
          const writable = await handle.createWritable();
          await writable.write(localContent);
          await writable.close();
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
    state.fileContents,
    state.dirtyBufferContents,
    state.pendingDiffs,
    state.pendingDeletions,
    tabState?.openTabs,
    state,
  ]);

  return null;
}
