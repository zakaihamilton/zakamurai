import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { useFileSystem } from '@/components/Storage';
import type { Tab } from '@/types/domain-types';
import { isMediaFile } from '@/utils/file';
import { useEffect, useRef } from 'react';
import { requireStore } from '../../types';

export function useTabRestorer() {
  const fs = useFileSystem();
  const tabState = requireStore(TabState.useState());
  const editorState = requireStore(EditorState.useState());
  const lastRootHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  useEffect(() => {
    if (!fs?.rootHandle || !fs?.getFileHandleAtPath) return;
    if (fs.rootHandle === lastRootHandleRef.current) return;

    const restore = async () => {
      lastRootHandleRef.current = fs.rootHandle;
      const parsedTabs = tabState.openTabs || [];
      const savedActiveTabId = tabState.activeTabId;

      if (parsedTabs && parsedTabs.length > 0) {
        const restoredTabs: Tab[] = [];
        const newContents: Record<string, string> = {};

        for (const tab of parsedTabs) {
          if (tab.type === 'file') {
            try {
              const handle = await fs.getFileHandleAtPath(tab.id);
              if (handle) {
                const content = isMediaFile(tab.label) ? null : await fs.readFile(handle);
                restoredTabs.push({
                  ...tab,
                  file: { name: tab.label, path: tab.id.split('/'), content: content ?? undefined },
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
