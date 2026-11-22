import { readEffectiveFileContent } from '@/components/App/Views/EditorArea/EditorBuffers';
import type { SidebarFileLoaderParams } from '@/components/App/types';
import { isMediaFile } from '@/utils/file';
import { FILE_VIEW_TYPES, getDefaultFileViewType } from '@/utils/fileViews';
import { useCallback, useRef } from 'react';
import { findNodeAtPath, getInitialFileContents } from './TreeUtils';
import type { SidebarRow, WorkspaceSnapshot } from './useSidebarDirectoryLoader';

export type OpenFileOptions = {
  viewType?: string;
};

export function useSidebarFileOpener({
  fs,
  appState,
  sidebarState,
  tabState,
  editorState,
  addNotification,
  captureWorkspace,
  isCurrentWorkspace,
}: Pick<
  SidebarFileLoaderParams,
  'fs' | 'appState' | 'sidebarState' | 'tabState' | 'editorState' | 'addNotification'
> & {
  captureWorkspace: () => WorkspaceSnapshot;
  isCurrentWorkspace: (token: WorkspaceSnapshot) => boolean;
}) {
  const { isMobile } = appState;
  const openFileRequestRef = useRef(0);

  const handleOpenFile = useCallback(
    async (row: SidebarRow, options: OpenFileOptions = {}) => {
      const workspace = captureWorkspace();
      const requestId = ++openFileRequestRef.current;
      const viewType = options.viewType || getDefaultFileViewType(row.item.name);
      let content = '';
      const shouldLoadText =
        !isMediaFile(row.item.name) ||
        viewType === FILE_VIEW_TYPES.EDITOR ||
        viewType === FILE_VIEW_TYPES.TOKEN_BREAKDOWN;

      const existingContent = readEffectiveFileContent(editorState, row.pathStr);
      const fileHandle = row.item.handle as FileSystemFileHandle | undefined;
      const hasDirtyBuffer = Object.hasOwn(editorState.dirtyBufferContents || {}, row.pathStr);
      const hasPendingDiff = Object.hasOwn(editorState.pendingDiffs || {}, row.pathStr);
      const hasPendingDeletion = Object.hasOwn(editorState.pendingDeletions || {}, row.pathStr);
      const shouldPreferEffectiveContent =
        existingContent !== undefined &&
        (fs.mode !== 'local' ||
          hasDirtyBuffer ||
          hasPendingDiff ||
          hasPendingDeletion ||
          !fileHandle);

      if (shouldPreferEffectiveContent && shouldLoadText) {
        content = existingContent;
      } else if (fs.mode === 'local' && fileHandle && shouldLoadText) {
        try {
          content = await fs.readFile(fileHandle);
        } catch (error) {
          if (!isCurrentWorkspace(workspace)) return;
          addNotification(
            `Could not open "${row.item.name}": ${error instanceof Error ? error.message : String(error)}`,
            'error',
          );
          return;
        }
      } else if (existingContent !== undefined && shouldLoadText) {
        content = existingContent;
      }

      const currentNode = findNodeAtPath(sidebarState.folderTree || [], row.path);
      if (
        requestId !== openFileRequestRef.current ||
        !isCurrentWorkspace(workspace) ||
        !currentNode ||
        currentNode.handle !== row.item.handle
      ) {
        return;
      }

      if (fs.mode !== 'local' && shouldLoadText && existingContent === undefined) {
        content = getInitialFileContents()[row.pathStr] ?? '';
      }

      if (shouldLoadText) {
        editorState((draft) => {
          draft.fileContents = { ...draft.fileContents, [row.pathStr]: content };
        });
      }

      tabState((draft) => {
        const existingTab = draft.openTabs.find((tab) => tab.id === row.pathStr);
        if (!existingTab) {
          draft.openTabs = [
            ...draft.openTabs,
            {
              id: row.pathStr,
              type: 'file',
              label: row.item.name,
              viewType,
              file: { ...row.item, path: row.path, content },
              fsHandle: fileHandle,
            },
          ];
        } else {
          draft.openTabs = draft.openTabs.map((tab) =>
            tab.id === row.pathStr ? { ...tab, viewType } : tab,
          );
        }
        if (existingTab && shouldLoadText) {
          draft.openTabs = draft.openTabs.map((tab) =>
            tab.id === row.pathStr
              ? {
                  ...tab,
                  file: tab.file
                    ? { ...tab.file, path: row.path, content }
                    : { name: row.item.name, path: row.path, content },
                }
              : tab,
          );
        }
        draft.activeTabId = row.pathStr;
      });

      sidebarState((draft) => {
        const nextExpanded = { ...draft.expandedFolders };
        let runningPath = '';
        for (const segment of row.path.slice(0, -1)) {
          runningPath = runningPath ? `${runningPath}/${segment}` : segment;
          nextExpanded[runningPath] = true;
        }
        draft.expandedFolders = nextExpanded;
        if (isMobile) draft.isSidebarOpen = false;
      });
    },
    [
      addNotification,
      captureWorkspace,
      editorState,
      fs,
      isCurrentWorkspace,
      isMobile,
      sidebarState,
      tabState,
    ],
  );

  return { handleOpenFile };
}
