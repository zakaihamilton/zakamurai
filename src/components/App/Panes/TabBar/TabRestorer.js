import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import Settings from '@/components/Storage/Settings';
import { isMediaFile } from '@/utils/file';
import { useEffect, useRef } from 'react';

export function useTabRestorer() {
  const { fs } = AppState.useState();
  const tabState = TabState.useState();
  const editorState = EditorState.useState();
  const lastRootHandleRef = useRef(null);

  useEffect(() => {
    if (!fs?.rootHandle || !fs?.getFileHandleAtPath) return;
    if (fs.rootHandle === lastRootHandleRef.current) return;

    const restore = async () => {
      lastRootHandleRef.current = fs.rootHandle;
      const parsedTabs = tabState.openTabs.length > 0 ? tabState.openTabs : Settings.getOpenTabs();
      const savedActiveTabId = tabState.activeTabId || Settings.getActiveTabId();

      if (parsedTabs && parsedTabs.length > 0) {
        const restoredTabs = [];
        const newContents = {};

        for (const tab of parsedTabs) {
          if (tab.type === 'file') {
            try {
              const handle = await fs.getFileHandleAtPath(tab.id);
              if (handle) {
                const content = isMediaFile(tab.label) ? null : await fs.readFile(handle);
                restoredTabs.push({
                  ...tab,
                  file: { name: tab.label, path: tab.id.split('/'), content },
                  fsHandle: handle,
                });
                if (content !== null && content !== undefined) {
                  newContents[tab.id] = content;
                }
              }
            } catch (e) {
              console.error(`Failed to restore tab ${tab.id}`, e);
            }
          } else {
            restoredTabs.push(tab);
          }
        }

        editorState((draft) => {
          const pending = draft.pendingDiffs || {};
          const merged = { ...draft.fileContents };
          for (const [path, content] of Object.entries(newContents)) {
            // Keep in-memory AI review buffers; do not clobber with disk.
            if (pending[path]) continue;
            merged[path] = content;
          }
          draft.fileContents = merged;
        });
        tabState((draft) => {
          draft.openTabs = restoredTabs;
          if (savedActiveTabId && restoredTabs.some((t) => t.id === savedActiveTabId)) {
            draft.activeTabId = savedActiveTabId;
          } else {
            draft.activeTabId =
              restoredTabs.length > 0 ? restoredTabs[restoredTabs.length - 1].id : null;
          }
        });
      }
    };

    restore();
  }, [fs, tabState, editorState]);
}
