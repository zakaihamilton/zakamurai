import { EditorState } from '@/components/App/Views/EditorArea';
import Settings from '@/components/Storage/Settings';
import type { PendingDiff } from '@/components/state/domain-types';
import { useEffect } from 'react';

let skipNextEditorBufferFlush = false;

/** Prevent the old workspace from overwriting a deliberately persisted new project on reload. */
export function skipEditorBufferFlushOnce() {
  skipNextEditorBufferFlush = true;
}

/**
 * Flushes editor contents on beforeunload. Regular persistence lives in SettingsSync;
 * this keeps a synchronous last-chance write when the tab closes.
 */
export function useContentSaver() {
  const state = EditorState.usePassiveState();

  useEffect(() => {
    if (!state) return undefined;

    const saveContents = () => {
      if (skipNextEditorBufferFlush) {
        skipNextEditorBufferFlush = false;
        return;
      }
      // Read directly from the Proxy to bypass React closure staleness
      // in the event of a synchronous beforeunload firing.
      const currentContents = state.fileContents;
      const currentDiffs = state.pendingDiffs;
      const currentDeletions = state.pendingDeletions;

      const diffsToSave: Record<string, PendingDiff> = {};
      for (const [path, diff] of Object.entries(currentDiffs || {})) {
        if (typeof diff?.originalContent !== 'string' || !Array.isArray(diff?.diffs)) continue;
        diffsToSave[path] = {
          ...diff,
          modifiedContent: currentContents?.[path] ?? diff.modifiedContent ?? '',
        };
      }
      Settings.flushEditorBuffersSync({ ...currentContents }, diffsToSave, {
        ...(currentDeletions || {}),
      });
    };

    window.addEventListener('beforeunload', saveContents);

    return () => {
      window.removeEventListener('beforeunload', saveContents);
    };
  }, [state]);
}
