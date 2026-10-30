import type { FlatTreeRow } from '@/components/App/types';
import { remapEditorPathStateInDraft } from '@/components/App/Views/EditorArea/EditorBuffers';
import { remapChangeSetPaths } from '@/components/Workspace';
import { remapLastCodeTabPathInDraft } from '@/components/App/Panes/TabBar/TabStateUtils';
import type { SidebarStateShape, TabStateShape } from '@/types/domain-types';
import { useCallback, useRef } from 'react';
import type { Draft } from 'triactor';
import { findNodeAtPath, getPathStr, moveNodeAtPath } from './TreeUtils';
import type { UseSidebarDragAndDropParams } from './sidebar-types';

const remapPrefix = (path: string, oldPrefix: string, newPrefix: string) =>
  path === oldPrefix || path.startsWith(`${oldPrefix}/`)
    ? newPrefix + path.substring(oldPrefix.length)
    : path;

export default function useSidebarDragAndDrop({
  fs,
  appState,
  sidebarState,
  editorState,
  tabState,
  changeSetState,
  addNotification,
  setDropTargetPath,
}: UseSidebarDragAndDropParams) {
  const workspaceEpochRef = useRef(appState?.workspaceEpoch || 0);
  const rootHandleRef = useRef(fs.rootHandle);
  const fsModeRef = useRef(fs.mode);
  workspaceEpochRef.current = appState?.workspaceEpoch || 0;
  rootHandleRef.current = fs.rootHandle;
  fsModeRef.current = fs.mode;

  const captureWorkspace = useCallback(
    () => ({
      rootHandle: rootHandleRef.current,
      mode: fsModeRef.current,
      epoch: workspaceEpochRef.current,
    }),
    [],
  );
  const isCurrentWorkspace = useCallback(
    (token: ReturnType<typeof captureWorkspace>) =>
      token.rootHandle === rootHandleRef.current &&
      token.mode === fsModeRef.current &&
      token.epoch === workspaceEpochRef.current,
    [],
  );

  const handleDragStart = useCallback(
    (event: React.DragEvent, row: FlatTreeRow) => {
      if (row.item.isRoot) {
        event.preventDefault();
        return;
      }
      sidebarState((draft: Draft<SidebarStateShape>) => {
        draft.draggedItem = {
          path: row.path,
          type: row.item.type,
          handle: row.item.handle ?? undefined,
          name: row.item.name,
        };
      });
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', row.pathStr);
    },
    [sidebarState],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent, row: FlatTreeRow) => {
      const draggedItem = sidebarState.draggedItem;
      if (!draggedItem?.path || row.item.type !== 'folder') return;
      const sourcePath = getPathStr(draggedItem.path);
      const invalid = sourcePath === row.pathStr || row.pathStr.startsWith(`${sourcePath}/`);
      if (!invalid) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }
    },
    [sidebarState.draggedItem],
  );

  const handleDragEnter = useCallback(
    (_event: React.DragEvent, row: FlatTreeRow) => {
      const draggedItem = sidebarState.draggedItem;
      if (!draggedItem?.path || row.item.type !== 'folder') return;
      const sourcePath = getPathStr(draggedItem.path);
      if (sourcePath !== row.pathStr && !row.pathStr.startsWith(`${sourcePath}/`)) {
        setDropTargetPath(row.pathStr);
      }
    },
    [sidebarState.draggedItem, setDropTargetPath],
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent, row: FlatTreeRow) => {
      event.preventDefault();
      setDropTargetPath(null);
      const workspace = captureWorkspace();
      const draggedItem = sidebarState.draggedItem;
      if (!draggedItem?.path || !draggedItem.name || row.item.type !== 'folder') return;
      const sourcePathStr = getPathStr(draggedItem.path);
      const nextPath = [...row.path, draggedItem.name];
      const nextPathStr = getPathStr(nextPath);
      if (sourcePathStr === row.pathStr || row.pathStr.startsWith(`${sourcePathStr}/`)) return;
      if (getPathStr(draggedItem.path.slice(0, -1)) === row.pathStr) {
        sidebarState((draft: Draft<SidebarStateShape>) => {
          draft.draggedItem = null;
        });
        return;
      }

      const source = findNodeAtPath(sidebarState.folderTree, draggedItem.path);
      if (!source) {
        addNotification?.(
          'The item could not be moved because it is no longer in the sidebar.',
          'error',
        );
        return;
      }
      const destinationChildren = row.path.length
        ? findNodeAtPath(sidebarState.folderTree, row.path)?.children || []
        : sidebarState.folderTree;
      const collision = destinationChildren.some((node) => {
        if (node.name !== draggedItem.name) return false;
        const nodePath = node.path?.length ? node.path : [...row.path, node.name];
        return getPathStr(nodePath) !== sourcePathStr;
      });
      if (collision) {
        addNotification?.(`An item named "${draggedItem.name}" already exists there.`, 'error');
        sidebarState((draft: Draft<SidebarStateShape>) => {
          draft.draggedItem = null;
        });
        return;
      }

      if (fs.mode === 'local') {
        if (!draggedItem.handle) {
          addNotification?.('The item is no longer available in the mounted project.', 'error');
          sidebarState((draft: Draft<SidebarStateShape>) => {
            draft.draggedItem = null;
          });
          return;
        }
        if (!row.item.handle || row.item.handle.kind !== 'directory') {
          addNotification?.('The destination folder is not available.', 'error');
          sidebarState((draft: Draft<SidebarStateShape>) => {
            draft.draggedItem = null;
          });
          return;
        }
        try {
          for await (const [name] of (row.item.handle as FileSystemDirectoryHandle).entries()) {
            if (name === draggedItem.name) {
              addNotification?.(
                `An item named "${draggedItem.name}" already exists there.`,
                'error',
              );
              sidebarState((draft: Draft<SidebarStateShape>) => {
                draft.draggedItem = null;
              });
              return;
            }
          }
        } catch (error) {
          if (!isCurrentWorkspace(workspace)) return;
          addNotification?.(
            `Could not inspect the destination folder: ${error instanceof Error ? error.message : String(error)}`,
            'error',
          );
          sidebarState((draft: Draft<SidebarStateShape>) => {
            draft.draggedItem = null;
          });
          return;
        }
        if (!isCurrentWorkspace(workspace)) return;
        const moved = await fs.moveEntry(
          draggedItem.handle,
          row.item.handle as FileSystemDirectoryHandle,
        );
        if (!isCurrentWorkspace(workspace)) return;
        if (!moved) {
          addNotification?.('The item could not be moved in the mounted project.', 'error');
          sidebarState((draft: Draft<SidebarStateShape>) => {
            draft.draggedItem = null;
          });
          return;
        }
      }

      if (!isCurrentWorkspace(workspace)) return;

      sidebarState((draft: Draft<SidebarStateShape>) => {
        draft.folderTree = moveNodeAtPath(draft.folderTree, draggedItem.path || [], nextPath);
        draft.draggedItem = null;
        const nextExpanded: Record<string, boolean> = {};
        for (const key in draft.expandedFolders) {
          nextExpanded[
            key === sourcePathStr || key.startsWith(`${sourcePathStr}/`)
              ? nextPathStr + key.substring(sourcePathStr.length)
              : key
          ] = draft.expandedFolders[key];
        }
        draft.expandedFolders = nextExpanded;
      });

      editorState?.((draft) => {
        remapEditorPathStateInDraft(draft, sourcePathStr, nextPathStr);
      });
      remapChangeSetPaths(changeSetState, sourcePathStr, nextPathStr);
      tabState?.((draft: Draft<TabStateShape>) => {
        draft.openTabs = draft.openTabs.map((tab) => {
          const id = remapPrefix(tab.id, sourcePathStr, nextPathStr);
          const sourceFilePath = tab.sourceFilePath
            ? remapPrefix(tab.sourceFilePath, sourcePathStr, nextPathStr)
            : undefined;
          return {
            ...tab,
            id,
            ...(sourceFilePath === undefined ? {} : { sourceFilePath }),
            ...(tab.file
              ? {
                  file: {
                    ...tab.file,
                    path: id.split('/'),
                    ...(tab.id === sourcePathStr ? { name: draggedItem.name } : {}),
                  },
                }
              : {}),
          };
        });
        if (draft.activeTabId) {
          draft.activeTabId = remapPrefix(draft.activeTabId, sourcePathStr, nextPathStr);
        }
        remapLastCodeTabPathInDraft(draft, sourcePathStr, nextPathStr);
      });
      addNotification?.(`Moved "${draggedItem.name}".`, 'success');
    },
    [
      addNotification,
      captureWorkspace,
      changeSetState,
      editorState,
      fs,
      isCurrentWorkspace,
      setDropTargetPath,
      sidebarState,
      tabState,
    ],
  );

  return {
    handleDragStart,
    handleDragOver,
    handleDragEnter,
    handleDrop,
  };
}
