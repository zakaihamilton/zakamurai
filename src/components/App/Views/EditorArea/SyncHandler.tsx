import { useEffect, useRef } from 'react';
import type { SyncHandlerProps } from './types';

export default function SyncHandler({
  fs,
  filePath,
  localContent,
  state,
  tabState,
}: SyncHandlerProps) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContent = useRef(localContent);

  useEffect(() => {
    if (fs.mode !== 'local' || !filePath) return;
    if (state.pendingDiffs?.[filePath] || state.pendingDeletions?.[filePath]) return;
    if (localContent === lastSavedContent.current) return;

    const currentTab = tabState?.openTabs.find((t) => t.id === filePath);
    const handle = currentTab?.fsHandle;
    if (!handle) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
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
    }, 1000);

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
  ]);

  useEffect(() => {
    if (fs.mode !== 'local' || !filePath) return;

    const flush = async () => {
      if (state.pendingDiffs?.[filePath] || state.pendingDeletions?.[filePath]) return;

      const currentTab = tabState?.openTabs.find((t) => t.id === filePath);
      const handle = currentTab?.fsHandle;
      if (handle && localContent !== state.fileContents?.[filePath]) {
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
    state.pendingDiffs,
    state.pendingDeletions,
    tabState?.openTabs,
    state,
  ]);

  return null;
}
