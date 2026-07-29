import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { PreviewState } from '@/components/App/PreviewState';
import { EditorState } from '@/components/App/Views/EditorArea';
import { useFileSystem } from '@/components/Storage';
import { useEffect, useRef } from 'react';
import { requireStore } from '../../types';

/**
 * On reload, saved preview HTML alone is not enough — bundled /dist/assets are gone.
 * Trigger a silent recompile so preview can serve real production output again.
 */
export function usePreviewRestorer() {
  const previewState = requireStore(PreviewState.useState(['htmlContent', 'isCompilerReady', 'restoreError']));
  const { htmlContent } = previewState;
  const appState = requireStore(AppState.useState(['silentCompileRequest']));
  const fs = useFileSystem();
  const sidebarState = requireStore(SidebarState.useState(['folderTree']));
  const editorState = requireStore(EditorState.useState(['fileContents']));
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current || !fs?.isReady) return;
    restoredRef.current = true;

    if (!htmlContent) {
      previewState((draft) => {
        draft.isCompilerReady = true;
      });
      return;
    }

    const restore = async () => {
      try {
        previewState((draft) => {
          draft.isCompilerReady = false;
          draft.restoreError = null;
        });

        const { Compiler } = await import('@/utils/compiler');
        const compiler = new Compiler(() => {});
        const container = await compiler.init();
        if (!container.vfs.existsSync('/dist')) {
          container.vfs.mkdirSync('/dist', { recursive: true });
        }
        container.vfs.writeFileSync('/dist/index.html', htmlContent);
        container.vfs.writeFileSync('/index.html', htmlContent);
        await compiler.syncFiles(fs, sidebarState.folderTree, editorState.fileContents);

        const hasAssets =
          container.vfs.existsSync('/dist') &&
          (container.vfs.readdirSync('/dist') || []).some(
            (name) => name === 'assets' || name.endsWith('.js') || name.endsWith('.css'),
          );

        if (!hasAssets) {
          // VFS lost hashed bundles — rebuild quietly.
          appState((draft) => {
            draft.silentCompileRequest = (draft.silentCompileRequest || 0) + 1;
          });
          return;
        }

        previewState((draft) => {
          draft.previewAddress = '/preview/dist/index.html';
          draft.isCompilerReady = true;
        });
      } catch (e) {
        previewState((draft) => {
          draft.restoreError = e?.message || String(e);
          draft.isCompilerReady = true;
        });
      }
    };

    restore();
  }, [htmlContent, fs, sidebarState.folderTree, editorState.fileContents, previewState, appState]);
}
