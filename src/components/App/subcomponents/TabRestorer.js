import { AppState } from '@/components/App/AppState';
import { EditorState } from '@/components/App/EditorArea';
import { TabState } from '@/components/App/TabBar';
import Settings from '@/components/Storage/Settings';
import { useEffect, useRef } from 'react';

export default function TabRestorer() {
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
                const content = await fs.readFile(handle);
                restoredTabs.push({
                  ...tab,
                  file: { name: tab.label, path: tab.id.split('/') },
                  fsHandle: handle,
                });
                if (content !== undefined && !editorState.fileContents?.[tab.id]) {
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

        if (restoredTabs.length > 0) {
          editorState((draft) => {
            draft.fileContents = { ...draft.fileContents, ...newContents };
          });
          tabState((draft) => {
            draft.openTabs = restoredTabs;
            if (savedActiveTabId && restoredTabs.some((t) => t.id === savedActiveTabId)) {
              draft.activeTabId = savedActiveTabId;
            }
          });
        }
      }
    };

    restore();
  }, [fs, tabState, editorState]);

  return null;
}
