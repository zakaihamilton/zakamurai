import { EditorState } from '@/components/App/Views/EditorArea';
import Settings from '@/components/Storage/Settings';
import { useEffect } from 'react';

export default function ContentSaver() {
  const { fileContents, pendingDiffs } = EditorState.useState();
  useEffect(() => {
    const timer = setTimeout(() => {
      const contentsToSave = { ...fileContents };
      if (pendingDiffs) {
        for (const [path, diff] of Object.entries(pendingDiffs)) {
          if (diff.originalContent !== undefined) {
            contentsToSave[path] = diff.originalContent;
          }
        }
      }
      Settings.setFileContents(contentsToSave);
    }, 1000);
    return () => clearTimeout(timer);
  }, [fileContents, pendingDiffs]);
  return null;
}
