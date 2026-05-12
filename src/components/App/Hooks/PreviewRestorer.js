import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { PreviewState } from '@/components/App/PreviewState';
import { EditorState } from '@/components/App/Views/EditorArea';
import { Compiler } from '@/utils/compiler';
import { useEffect, useRef } from 'react';

export function usePreviewRestorer() {
  const previewState = PreviewState.useState();
  const { htmlContent } = previewState;
  const { fs } = AppState.useState();
  const sidebarState = SidebarState.useState();
  const editorState = EditorState.useState();
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current || !fs?.isReady) return;
    restoredRef.current = true;

    if (htmlContent) {
      const restore = async () => {
        try {
          const compiler = new Compiler(() => {});
          const container = await compiler.init();
          if (!container.vfs.existsSync('/dist')) {
            container.vfs.mkdirSync('/dist', { recursive: true });
          }
          container.vfs.writeFileSync('/dist/index.html', htmlContent);
          container.vfs.writeFileSync('/index.html', htmlContent);

          // Also sync files so that imports in index.html work
          await compiler.syncFiles(fs, sidebarState.folderTree, editorState.fileContents);
        } catch (e) {
          console.error('Failed to restore preview filesystem', e);
        } finally {
          // Mark as ready even on error so we don't stay stuck
          previewState((draft) => {
            draft.isCompilerReady = true;
          });
        }
      };
      restore();
    } else if (!htmlContent) {
      // If no content, it's "ready" in the sense that there's nothing to restore
      previewState((draft) => {
        draft.isCompilerReady = true;
      });
    }
  }, [htmlContent, fs, sidebarState.folderTree, editorState.fileContents, previewState]);
}
