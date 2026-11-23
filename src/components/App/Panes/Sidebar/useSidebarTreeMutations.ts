import {
  remapLastCodeTabPathInDraft,
  removeLastCodeTabPathInDraft,
} from '@/components/App/Panes/TabBar/TabStateUtils';
import {
  remapEditorPathStateInDraft,
  removeEditorPathStateInDraft,
} from '@/components/App/Views/EditorArea/EditorBuffers';
import type { SidebarFileLoaderParams } from '@/components/App/types';
import { remapChangeSetPaths, removeChangeSetPaths } from '@/components/Workspace';
import type { TreeNode } from '@/types/domain-types';
import { useCallback } from 'react';
import {
  addNodeAtPath,
  findNodeAtPath,
  getPathStr,
  isValidEntryName,
  removeNodeAtPath,
  renameNodeAtPath,
} from './TreeUtils';
import type { SidebarRow, WorkspaceSnapshot } from './useSidebarDirectoryLoader';

export function useSidebarTreeMutations({
  fs,
  appState,
  sidebarState,
  tabState,
  editorState,
  changeSetState,
  addNotification,
  captureWorkspace,
  isCurrentWorkspace,
  loadChildren,
}: Pick<
  SidebarFileLoaderParams,
  | 'fs'
  | 'appState'
  | 'sidebarState'
  | 'tabState'
  | 'editorState'
  | 'changeSetState'
  | 'addNotification'
> & {
  captureWorkspace: () => WorkspaceSnapshot;
  isCurrentWorkspace: (token: WorkspaceSnapshot) => boolean;
  loadChildren: (row: SidebarRow, force?: boolean) => Promise<void>;
}) {
  const { folderTree = [] } = sidebarState;

  const handleRename = useCallback(
    async (row: SidebarRow, nextName: string) => {
      const workspace = captureWorkspace();
      if (row.item.isRoot) {
        appState((draft) => {
          draft.projectName = nextName;
        });
        addNotification(`Renamed project to "${nextName}"`, 'success');
        return true;
      }

      const oldPathStr = row.pathStr;
      if (!isValidEntryName(nextName)) {
        addNotification('Use a valid file or folder name without path separators.', 'error');
        return false;
      }
      if (nextName === row.item.name) return true;
      const siblings =
        row.path.length > 1
          ? findNodeAtPath(folderTree, row.path.slice(0, -1))?.children || []
          : folderTree;
      if (siblings.some((node) => node.name === nextName && node.name !== row.item.name)) {
        addNotification(`An item named "${nextName}" already exists here.`, 'error');
        return false;
      }
      const nextPath = [...row.path.slice(0, -1), nextName];
      const nextPathStr = getPathStr(nextPath);

      const entryHandle = row.item.handle;
      if (fs.mode === 'local' && !entryHandle) {
        addNotification('The item is no longer available in the mounted project.', 'error');
        return false;
      }
      if (fs.mode === 'local' && entryHandle) {
        try {
          if (!entryHandle.move) throw new Error('Rename is not supported by this browser.');
          await (entryHandle as unknown as { move: (name: string) => Promise<void> }).move(
            nextName,
          );
          if (!isCurrentWorkspace(workspace)) return false;
          fs.triggerRefresh();
        } catch (err) {
          if (!isCurrentWorkspace(workspace)) return false;
          console.error('Failed to rename local file:', err);
          addNotification(
            `Could not rename "${row.item.name}": ${err instanceof Error ? err.message : String(err)}`,
            'error',
          );
          return false;
        }
      }

      if (!isCurrentWorkspace(workspace)) return false;

      sidebarState((draft) => {
        draft.folderTree = renameNodeAtPath(draft.folderTree, row.path, nextName);
        const nextExpanded: Record<string, boolean> = {};
        for (const key in draft.expandedFolders) {
          if (key === oldPathStr || key.startsWith(`${oldPathStr}/`)) {
            nextExpanded[nextPathStr + key.substring(oldPathStr.length)] =
              draft.expandedFolders[key];
          } else {
            nextExpanded[key] = draft.expandedFolders[key];
          }
        }
        draft.expandedFolders = nextExpanded;
      });

      editorState((draft) => {
        remapEditorPathStateInDraft(draft, oldPathStr, nextPathStr);
      });
      remapChangeSetPaths(changeSetState, oldPathStr, nextPathStr);

      tabState((draft) => {
        draft.openTabs = (draft.openTabs || []).map((tab) => {
          if (tab.id === oldPathStr || tab.id.startsWith(`${oldPathStr}/`)) {
            const nextId = nextPathStr + tab.id.substring(oldPathStr.length);
            return {
              ...tab,
              id: nextId,
              label: nextId === nextPathStr ? nextName : tab.label,
              ...(tab.sourceFilePath
                ? {
                    sourceFilePath:
                      tab.sourceFilePath === oldPathStr ||
                      tab.sourceFilePath.startsWith(`${oldPathStr}/`)
                        ? nextPathStr + tab.sourceFilePath.substring(oldPathStr.length)
                        : tab.sourceFilePath,
                  }
                : {}),
              file: tab.file
                ? {
                    ...tab.file,
                    name: nextId === nextPathStr ? nextName : tab.file.name,
                    path: nextId.split('/'),
                  }
                : tab.file,
            };
          }
          return tab;
        });
        if (draft.activeTabId === oldPathStr || draft.activeTabId?.startsWith(`${oldPathStr}/`)) {
          draft.activeTabId = nextPathStr + (draft.activeTabId?.substring(oldPathStr.length) || '');
        }
        remapLastCodeTabPathInDraft(draft, oldPathStr, nextPathStr);
      });

      addNotification(`Renamed to "${nextName}"`, 'success');
      return true;
    },
    [
      addNotification,
      appState,
      captureWorkspace,
      changeSetState,
      editorState,
      folderTree,
      fs,
      isCurrentWorkspace,
      sidebarState,
      tabState,
    ],
  );

  const handleCreate = useCallback(
    async (row: SidebarRow, type: string, name: string) => {
      const workspace = captureWorkspace();
      if (!isValidEntryName(name)) {
        addNotification('Use a valid file or folder name without path separators.', 'error');
        return false;
      }
      const siblings = row.path.length
        ? findNodeAtPath(folderTree, row.path)?.children || []
        : folderTree;
      if (siblings.some((node) => node.name === name)) {
        addNotification(`An item named "${name}" already exists here.`, 'error');
        return false;
      }
      const dirHandle = row.item.handle as FileSystemDirectoryHandle | undefined;
      if (fs.mode === 'local' && !dirHandle) {
        addNotification('The destination folder is no longer available.', 'error');
        return false;
      }
      if (fs.mode === 'local' && dirHandle) {
        try {
          for await (const [existingName] of dirHandle.entries()) {
            if (existingName === name) {
              if (!isCurrentWorkspace(workspace)) return false;
              addNotification(`An item named "${name}" already exists here.`, 'error');
              return false;
            }
          }
          if (!isCurrentWorkspace(workspace)) return false;
          if (type === 'file') {
            const fileHandle = await dirHandle.getFileHandle(name, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.close();
          } else {
            await dirHandle.getDirectoryHandle(name, { create: true });
          }
          if (!isCurrentWorkspace(workspace)) return false;
          await loadChildren(row, true);
          if (isCurrentWorkspace(workspace)) fs.triggerRefresh();
        } catch (err) {
          if (!isCurrentWorkspace(workspace)) return false;
          console.error('Failed to create:', err);
          addNotification(
            `Could not create "${name}": ${err instanceof Error ? err.message : String(err)}`,
            'error',
          );
          return false;
        }
      } else {
        if (!isCurrentWorkspace(workspace)) return false;
        sidebarState((draft) => {
          draft.folderTree = addNodeAtPath(draft.folderTree, row.path, {
            name,
            kind: type === 'folder' ? 'directory' : 'file',
          } as TreeNode);
        });
      }
      addNotification(`${type === 'folder' ? 'Folder' : 'File'} "${name}" created`, 'success');
      return true;
    },
    [
      addNotification,
      captureWorkspace,
      folderTree,
      fs,
      isCurrentWorkspace,
      loadChildren,
      sidebarState,
    ],
  );

  const handleDelete = useCallback(
    async (row: SidebarRow) => {
      const workspace = captureWorkspace();
      if (row.item.isRoot) return;
      const parentPath = row.path.slice(0, -1);
      const parent = parentPath.length ? findNodeAtPath(folderTree, parentPath) : null;
      const parentHandle = (parent?.handle ||
        (parentPath.length === 0 ? fs.rootHandle : null)) as FileSystemDirectoryHandle | null;
      if (fs.mode === 'local' && (!row.item.handle || !parentHandle)) {
        addNotification('The item is no longer available in the mounted project.', 'error');
        return;
      }
      if (fs.mode === 'local' && row.item.handle && parentHandle) {
        try {
          await parentHandle.removeEntry(row.item.name, { recursive: true });
          if (!isCurrentWorkspace(workspace)) return;
          fs.triggerRefresh();
        } catch (err) {
          if (!isCurrentWorkspace(workspace)) return;
          console.error('Failed to delete:', err);
          addNotification(
            `Could not delete "${row.item.name}": ${err instanceof Error ? err.message : String(err)}`,
            'error',
          );
          return;
        }
      }

      if (!isCurrentWorkspace(workspace)) return;

      sidebarState((draft) => {
        draft.folderTree = removeNodeAtPath(draft.folderTree, row.path);
      });

      tabState((draft) => {
        const tabsToDelete = draft.openTabs.filter(
          (tab) => tab.id === row.pathStr || tab.id.startsWith(`${row.pathStr}/`),
        );
        draft.openTabs = draft.openTabs.filter((tab) => !tabsToDelete.includes(tab));
        if (tabsToDelete.some((tab) => tab.id === draft.activeTabId)) {
          draft.activeTabId = draft.openTabs.at(-1)?.id || null;
        }
        removeLastCodeTabPathInDraft(draft, [row.pathStr]);
      });

      editorState((draft) => {
        removeEditorPathStateInDraft(draft, row.pathStr);
      });
      removeChangeSetPaths(changeSetState, row.pathStr);

      addNotification(`"${row.item.name}" deleted`, 'info');
    },
    [
      addNotification,
      captureWorkspace,
      changeSetState,
      editorState,
      folderTree,
      fs,
      isCurrentWorkspace,
      sidebarState,
      tabState,
    ],
  );

  return { handleRename, handleCreate, handleDelete };
}
