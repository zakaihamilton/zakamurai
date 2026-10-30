import {
  readEffectiveFileContent,
  remapEditorPathStateInDraft,
  removeEditorPathStateInDraft,
} from '@/components/App/Views/EditorArea/EditorBuffers';
import type { SidebarFileLoaderParams } from '@/components/App/types';
import type { FlatTreeRow, NormalizedTreeNode } from '@/components/App/types';
import { isMediaFile } from '@/utils/file';
import { FILE_VIEW_TYPES, getDefaultFileViewType } from '@/utils/fileViews';
import { remapChangeSetPaths, removeChangeSetPaths } from '@/components/Workspace';
import {
  remapLastCodeTabPathInDraft,
  removeLastCodeTabPathInDraft,
} from '@/components/App/Panes/TabBar/TabStateUtils';
import { useCallback, useRef } from 'react';
import {
  addNodeAtPath,
  findNodeAtPath,
  getInitialFileContents,
  getPathStr,
  isValidEntryName,
  isNodeModulesPath,
  mergeFileSystemTree,
  normalizeChildren,
  removeNodeAtPath,
  renameNodeAtPath,
  setChildrenAtPath,
} from './TreeUtils';

type SidebarRow = FlatTreeRow & {
  item: NormalizedTreeNode & {
    isRoot?: boolean;
    handle?: FileSystemFileHandle | FileSystemDirectoryHandle | null;
  };
};

type ToggleOptions = {
  expandOnly?: boolean;
};

type OpenFileOptions = {
  viewType?: string;
};

export default function useSidebarFileLoader({
  fs,
  appState,
  sidebarState,
  tabState,
  editorState,
  changeSetState,
  setLoadingPaths,
  addNotification,
}: SidebarFileLoaderParams) {
  const { isMobile } = appState;
  const { folderTree = [], expandedFolders = {} } = sidebarState;
  const openFileRequestRef = useRef(0);
  const folderLoadRequestRef = useRef(new Map<string, number>());
  const rootHandleRef = useRef(fs.rootHandle);
  const fsModeRef = useRef(fs.mode);
  const workspaceEpochRef = useRef(appState.workspaceEpoch || 0);
  rootHandleRef.current = fs.rootHandle;
  fsModeRef.current = fs.mode;
  workspaceEpochRef.current = appState.workspaceEpoch || 0;

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

  const loadChildren = useCallback(
    async (row: SidebarRow, force = false) => {
      if (fs.mode !== 'local' || row.item.type !== 'folder' || !row.item.handle) return;
      if (!force && row.item.children && row.item.childrenLoaded !== false) return;
      const workspace = captureWorkspace();
      const rootHandle = fs.rootHandle;
      const requestId = (folderLoadRequestRef.current.get(row.pathStr) || 0) + 1;
      folderLoadRequestRef.current.set(row.pathStr, requestId);
      setLoadingPaths((current: Record<string, boolean>) => ({ ...current, [row.pathStr]: true }));
      try {
        const entries: Array<{
          name: string;
          kind: FileSystemHandleKind;
          handle: FileSystemHandle;
          type: 'file' | 'folder';
          path: string[];
        }> = [];
        const dirHandle = row.item.handle as FileSystemDirectoryHandle;
        for await (const [name, handle] of dirHandle.entries()) {
          entries.push({
            name,
            kind: handle.kind,
            handle,
            type: handle.kind === 'directory' ? 'folder' : 'file',
            path: [...row.path, name],
          });
        }
        if (
          rootHandleRef.current !== rootHandle ||
          fsModeRef.current !== 'local' ||
          !isCurrentWorkspace(workspace) ||
          folderLoadRequestRef.current.get(row.pathStr) !== requestId
        ) {
          return;
        }
        sidebarState((draft) => {
          const currentNode = findNodeAtPath(draft.folderTree || [], row.path);
          const stagedPaths = new Set([
            ...Object.keys(editorState.pendingDiffs || {}),
            ...Object.keys(editorState.pendingDeletions || {}),
            ...Object.keys(editorState.dirtyBufferContents || {}),
          ]);
          const preservesStagedPath = (
            node: import('@/types/domain-types').TreeNode,
            path: string[],
          ): boolean => {
            if (stagedPaths.has(path.join('/'))) return true;
            return Boolean(
              node.children?.some((child) =>
                preservesStagedPath(child, child.path || [...path, child.name]),
              ),
            );
          };
          const nextChildren = mergeFileSystemTree(
            normalizeChildren(entries, row.path),
            currentNode?.children || [],
            preservesStagedPath,
            row.path,
          );
          draft.folderTree = setChildrenAtPath(draft.folderTree, row.path, nextChildren, true);
          const nextExpanded = { ...(draft.expandedFolders || {}) };
          for (const child of entries) {
            const childPath = [...row.path, child.name];
            if (child.kind === 'directory' && isNodeModulesPath(childPath)) {
              nextExpanded[getPathStr(childPath)] = false;
            }
          }
          draft.expandedFolders = nextExpanded;
        });
      } catch (err) {
        console.error('Failed to load directory:', err);
      } finally {
        if (folderLoadRequestRef.current.get(row.pathStr) === requestId) {
          folderLoadRequestRef.current.delete(row.pathStr);
          setLoadingPaths((current: Record<string, boolean>) => {
            const next = { ...current };
            delete next[row.pathStr];
            return next;
          });
        }
      }
    },
    [
      captureWorkspace,
      editorState,
      fs.mode,
      fs.rootHandle,
      isCurrentWorkspace,
      sidebarState,
      setLoadingPaths,
    ],
  );

  const handleToggle = useCallback(
    (row: SidebarRow, options: ToggleOptions = {}) => {
      if (row.item.isRoot) return;
      if (row.item.type !== 'folder') return;
      const isCurrentlyExpanded = !!row.item.children && expandedFolders[row.pathStr] !== false;
      sidebarState((draft) => {
        draft.expandedFolders = {
          ...draft.expandedFolders,
          [row.pathStr]: options.expandOnly ? true : !isCurrentlyExpanded,
        };
      });
      if (!row.item.children || !isCurrentlyExpanded || options.expandOnly) {
        loadChildren(row, fs.mode === 'local');
      }
    },
    [expandedFolders, fs.mode, loadChildren, sidebarState],
  );

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
          } as import('@/types/domain-types').TreeNode);
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

  return {
    loadChildren,
    handleToggle,
    handleOpenFile,
    handleRename,
    handleCreate,
    handleDelete,
  };
}
