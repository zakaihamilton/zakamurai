import { EditorState } from '@/components/App/Views/EditorArea';
import Settings from '@/components/Storage/Settings';
import { useEffect } from 'react';

export function useContentSaver() {
  const state = EditorState.useState();

  useEffect(() => {
    const saveContents = () => {
      // Read directly from the Proxy to bypass React closure staleness
      // in the event of a synchronous beforeunload firing.
      const currentContents = state.fileContents;
      const currentDiffs = state.pendingDiffs;

      const contentsToSave = { ...currentContents };
      if (currentDiffs) {
        for (const [path, diff] of Object.entries(currentDiffs)) {
          if (diff.originalContent !== undefined) {
            contentsToSave[path] = diff.originalContent;
          }
        }
      }
      Settings.setFileContents(contentsToSave);
    };

    const timer = setTimeout(saveContents, 1000);
    window.addEventListener('beforeunload', saveContents);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeunload', saveContents);
    };
  }, [state, state.fileContents, state.pendingDiffs]);
}
