import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { PreviewState } from '@/components/App/PreviewState';
import { EditorState } from '@/components/App/Views/EditorArea';
import { Compiler } from '@/utils/compiler';
import { useEffect, useRef } from 'react';

export default function PreviewRestorer() {
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
          console.log(
            '[PreviewRestorer] Starting restore, htmlContent length:',
            htmlContent.length,
          );
          const compiler = new Compiler(() => {});
          const container = await compiler.init();
          console.log(
            '[PreviewRestorer] Container initialized, serverBridge:',
            !!container.serverBridge,
          );
          if (!container.vfs.existsSync('/dist')) {
            container.vfs.mkdirSync('/dist', { recursive: true });
          }
          container.vfs.writeFileSync('/dist/index.html', htmlContent);
          container.vfs.writeFileSync('/index.html', htmlContent);
          console.log(
            '[PreviewRestorer] VFS seeded. /dist/index.html exists:',
            container.vfs.existsSync('/dist/index.html'),
          );
          console.log(
            '[PreviewRestorer] /index.html exists:',
            container.vfs.existsSync('/index.html'),
          );

          // List /dist contents for debugging
          try {
            const distFiles = container.vfs.readdirSync('/dist');
            console.log('[PreviewRestorer] /dist contents:', distFiles);
          } catch (e) {
            console.log('[PreviewRestorer] Could not list /dist:', e.message);
          }

          // Also sync files so that imports in index.html work
          await compiler.syncFiles(fs, sidebarState.folderTree, editorState.fileContents);

          // Verify SW state
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            console.log(
              '[PreviewRestorer] SW registration:',
              reg
                ? {
                    scope: reg.scope,
                    active: !!reg.active,
                    waiting: !!reg.waiting,
                    installing: !!reg.installing,
                    activeScriptURL: reg.active?.scriptURL,
                  }
                : 'none',
            );
            console.log('[PreviewRestorer] SW controller:', !!navigator.serviceWorker.controller);
          }

          // Verification fetch: test that the preview path is served by the SW
          try {
            console.log('[PreviewRestorer] Running verification fetch for /preview/...');
            const resp = await fetch('/preview/');
            console.log('[PreviewRestorer] Verification fetch result:', {
              status: resp.status,
              statusText: resp.statusText,
              contentType: resp.headers.get('content-type'),
              bodyLength: (await resp.clone().text()).length,
            });
          } catch (fetchErr) {
            console.error('[PreviewRestorer] Verification fetch failed:', fetchErr);
          }
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

  return null;
}
