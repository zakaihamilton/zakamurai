import { EditorState } from '@/components/App/Views/EditorArea';
import Settings from '@/components/Storage/Settings';
import { useEffect } from 'react';

/**
 * Flushes editor contents on beforeunload. Regular persistence lives in SettingsSync;
 * this keeps a synchronous last-chance write when the tab closes.
 */
export function useContentSaver() {
  const state = EditorState.usePassiveState();

  useEffect(() => {
    if (!state) return undefined;

    const saveContents = () => {
      // Read directly from the Proxy to bypass React closure staleness
      // in the event of a synchronous beforeunload firing.
      const currentContents = state.fileContents;
      const currentDiffs = state.pendingDiffs;

      const diffsToSave = {};
      for (const [path, diff] of Object.entries(currentDiffs || {})) {
        if (typeof diff?.originalContent !== 'string' || !Array.isArray(diff?.diffs)) continue;
        diffsToSave[path] = {
          ...diff,
          modifiedContent: currentContents?.[path] ?? diff.modifiedContent ?? '',
        };
      }
      Settings.setFileContents({ ...currentContents });
      Settings.setPendingDiffs(diffsToSave);
    };

    window.addEventListener('beforeunload', saveContents);

    return () => {
      window.removeEventListener('beforeunload', saveContents);
    };
  }, [state]);
}
