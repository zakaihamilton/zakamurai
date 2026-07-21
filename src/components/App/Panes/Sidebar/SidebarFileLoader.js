import { deleteKeysWithPrefixInDraft, remapKeysInDraft } from '@/components/state/StateUtils';
import { isMediaFile } from '@/utils/file';
import { FILE_VIEW_TYPES, getDefaultFileViewType } from '@/utils/fileViews';
import { useCallback } from 'react';
import {
  addNodeAtPath,
  findNodeAtPath,
  flattenTree,
  getPathStr,
  isNodeModulesPath,
  normalizeChildren,
  removeNodeAtPath,
  renameNodeAtPath,
  setChildrenAtPath,
} from './TreeUtils';

const EDITOR_PATH_MAPS = [
  'fileContents',
  'pendingDiffs',
  'pendingDeletions',
  'history',
  'cursorPos',
  'selectedLines',
];

export default function useSidebarFileLoader({
  fs,
  appState,
  sidebarState,
  tabState,
  editorState,
  setLoadingPaths,
  addNotification,
}) {
  const { isMobile } = appState;
  const { folderTree = [], expandedFolders = {} } = sidebarState;

  const loadChildren = useCallback(
    async (row, force = false) => {
      if (fs.mode !== 'local' || row.item.type !== 'folder' || !row.item.handle) return;
      if (!force && row.item.children) return;
      setLoadingPaths((current) => ({ ...current, [row.pathStr]: true }));
      try {
        const entries = [];
        for await (const [name, handle] of row.item.handle.entries()) {
          entries.push({
            name,
            kind: handle.kind,
            handle,
            type: handle.kind === 'directory' ? 'folder' : 'file',
            path: [...row.path, name],
          });
        }
        sidebarState((draft) => {
          draft.folderTree = setChildrenAtPath(
            draft.folderTree,
            row.path,
            normalizeChildren(entries, row.path),
          );
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
        setLoadingPaths((current) => {
          const next = { ...current };
          delete next[row.pathStr];
          return next;
        });
      }
    },
    [fs.mode, sidebarState, setLoadingPaths],
  );

  const handleToggle = useCallback(
    (row, options = {}) => {
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
        loadChildren(row);
      }
    },
    [expandedFolders, loadChildren, sidebarState],
  );

  const handleOpenFile = useCallback(
    async (row, options = {}) => {
      const viewType = options.viewType || getDefaultFileViewType(row.item.name);
      let content = '';
      const shouldLoadText =
        !isMediaFile(row.item.name) ||
        viewType === FILE_VIEW_TYPES.EDITOR ||
        viewType === FILE_VIEW_TYPES.TOKEN_BREAKDOWN;

      if (fs.mode === 'local' && row.item.handle && shouldLoadText) {
        content = await fs.readFile(row.item.handle);
      }

      if (fs.mode !== 'local' && shouldLoadText) {
        const fileContents = editorState.fileContents || {};
        const { getInitialFileContents } = require('./TreeUtils');
        content = fileContents[row.pathStr] ?? getInitialFileContents()[row.pathStr] ?? '';
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
              fsHandle: row.item.handle,
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
              ? { ...tab, file: { ...tab.file, path: row.path, content } }
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
    [editorState, fs, isMobile, sidebarState, tabState],
  );

  const handleRename = useCallback(
    async (row, nextName) => {
      if (row.item.isRoot) {
        appState((draft) => {
          draft.projectName = nextName;
        });
        addNotification(`Renamed project to "${nextName}"`, 'success');
        return true;
      }

      const oldPathStr = row.pathStr;
      const nextPath = [...row.path.slice(0, -1), nextName];
      const nextPathStr = getPathStr(nextPath);

      if (fs.mode === 'local' && row.item.handle) {
        try {
          if (!row.item.handle.move) throw new Error('Rename is not supported by this browser.');
          await row.item.handle.move(nextName);
          fs.triggerRefresh();
        } catch (err) {
          console.error('Failed to rename local file:', err);
          return false;
        }
      }

      sidebarState((draft) => {
        draft.folderTree = renameNodeAtPath(draft.folderTree, row.path, nextName);
        const nextExpanded = {};
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
        remapKeysInDraft(draft, EDITOR_PATH_MAPS, oldPathStr, nextPathStr);
      });

      tabState((draft) => {
        for (const tab of draft.openTabs) {
          if (tab.id === oldPathStr || tab.id.startsWith(`${oldPathStr}/`)) {
            tab.id = nextPathStr + tab.id.substring(oldPathStr.length);
            if (tab.id === nextPathStr) tab.label = nextName;
          }
        }
        if (draft.activeTabId === oldPathStr || draft.activeTabId?.startsWith(`${oldPathStr}/`)) {
          draft.activeTabId = nextPathStr + draft.activeTabId.substring(oldPathStr.length);
        }
      });

      addNotification(`Renamed to "${nextName}"`, 'success');
      return true;
    },
    [addNotification, appState, editorState, fs, sidebarState, tabState],
  );

  const handleCreate = useCallback(
    async (row, type, name) => {
      if (fs.mode === 'local' && row.item.handle) {
        try {
          if (type === 'file') {
            const fileHandle = await row.item.handle.getFileHandle(name, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.close();
          } else {
            await row.item.handle.getDirectoryHandle(name, { create: true });
          }
          await loadChildren(row, true);
          fs.triggerRefresh();
        } catch (err) {
          console.error('Failed to create:', err);
          return false;
        }
      } else {
        sidebarState((draft) => {
          draft.folderTree = addNodeAtPath(draft.folderTree, row.path, {
            name,
            type: type === 'folder' ? 'folder' : 'file',
            children: type === 'folder' ? [] : undefined,
          });
        });
      }
      addNotification(`${type === 'folder' ? 'Folder' : 'File'} "${name}" created`, 'success');
      return true;
    },
    [addNotification, fs, loadChildren, sidebarState],
  );

  const handleDelete = useCallback(
    async (row) => {
      const parentPath = row.path.slice(0, -1);
      const parent = parentPath.length ? findNodeAtPath(folderTree, parentPath) : null;
      if (fs.mode === 'local' && parent?.handle) {
        try {
          await parent.handle.removeEntry(row.item.name, { recursive: true });
          fs.triggerRefresh();
        } catch (err) {
          console.error('Failed to delete:', err);
          return;
        }
      } else {
        sidebarState((draft) => {
          draft.folderTree = removeNodeAtPath(draft.folderTree, row.path);
        });
      }

      tabState((draft) => {
        const tabsToDelete = draft.openTabs.filter(
          (tab) => tab.id === row.pathStr || tab.id.startsWith(`${row.pathStr}/`),
        );
        draft.openTabs = draft.openTabs.filter((tab) => !tabsToDelete.includes(tab));
        if (tabsToDelete.some((tab) => tab.id === draft.activeTabId)) {
          draft.activeTabId = draft.openTabs.at(-1)?.id || null;
        }
      });

      editorState((draft) => {
        deleteKeysWithPrefixInDraft(draft, EDITOR_PATH_MAPS, row.pathStr);
      });

      addNotification(`"${row.item.name}" deleted`, 'info');
    },
    [addNotification, editorState, folderTree, fs, sidebarState, tabState],
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
