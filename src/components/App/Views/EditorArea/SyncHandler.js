import { useEffect, useRef } from 'react';

export default function SyncHandler({ fs, filePath, localContent, state, tabState }) {
  const saveTimeoutRef = useRef(null);
  const lastSavedContent = useRef(localContent);

  // Auto-save to Local FS if applicable
  // biome-ignore lint/correctness/useExhaustiveDependencies: state is a stable dispatcher in this context, and including it would cause infinite loops
  useEffect(() => {
    if (fs.mode !== 'local' || !filePath) return;
    if (localContent === lastSavedContent.current) return;

    const currentTab = tabState.openTabs.find((t) => t.id === filePath);
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
  }, [localContent, filePath, fs.mode, tabState.openTabs]);

  // Flush changes to disk on window reload/close
  useEffect(() => {
    if (fs.mode !== 'local' || !filePath) return;

    const flush = async () => {
      if (state.pendingDiffs?.[filePath]) return; // Do not flush if there are pending AI changes

      const currentTab = tabState.openTabs.find((t) => t.id === filePath);
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
  }, [fs.mode, filePath, localContent, state.fileContents, state.pendingDiffs, tabState.openTabs]);

  return null;
}
