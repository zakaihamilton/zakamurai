import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { Icons } from '@/components/Core/Base/Icons';
import { createState } from '@/components/Core/Base/State';
import { DEFAULT_CONTENTS, SCRATCH_CONTENTS } from '@/components/Storage/InitialData';
import Settings from '@/components/Storage/Settings';
import { useNotification } from '@/components/Widgets/Notification/Notification';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { isMediaFile } from '@/utils/file';
import { formatShortcut } from '@/utils/os';
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import styles from './Sidebar.module.css';
import TreeItem from './TreeItem';
import VirtualList from './VirtualList';

export const SidebarState = createState('SidebarState');
const SidebarUiState = createState('SidebarUiState');

const ROW_HEIGHT = 34;

const getNodeType = (node) => node.type || (node.kind === 'directory' ? 'folder' : 'file');
const getPathStr = (path) => path.join('/');
const isNodeModulesPath = (path) => path.includes('node_modules');
const getInitialFileContents = () =>
  Settings.getTemplate() === 'scratch' ? SCRATCH_CONTENTS : DEFAULT_CONTENTS;

const treeSorter = (a, b) => {
  const aType = getNodeType(a);
  const bType = getNodeType(b);
  if (aType === bType) return a.name.localeCompare(b.name, undefined, { numeric: true });
  return aType === 'folder' ? -1 : 1;
};

const normalizeChildren = (nodes = [], parentPath = []) =>
  [...nodes].sort(treeSorter).map((node) => {
    const type = getNodeType(node);
    const path = node.path || [...parentPath, node.name];
    return {
      ...node,
      type,
      path,
      children: node.children ? normalizeChildren(node.children, path) : node.children,
    };
  });

const setChildrenAtPath = (nodes, path, children) => {
  if (path.length === 0) return children;
  return nodes.map((node) => {
    if (node.name !== path[0]) return node;
    const nextChildren = setChildrenAtPath(node.children || [], path.slice(1), children);
    return { ...node, children: nextChildren };
  });
};

const renameNodeAtPath = (nodes, path, name) =>
  nodes.map((node) => {
    if (node.name !== path[0]) return node;
    if (path.length === 1) return { ...node, name, path: [...node.path.slice(0, -1), name] };
    return { ...node, children: renameNodeAtPath(node.children || [], path.slice(1), name) };
  });

const addNodeAtPath = (nodes, path, node) => {
  if (path.length === 0) return normalizeChildren([...nodes, node]);
  return nodes.map((current) => {
    if (current.name !== path[0]) return current;
    return { ...current, children: addNodeAtPath(current.children || [], path.slice(1), node) };
  });
};

const removeNodeAtPath = (nodes, path) => {
  if (path.length === 1) return nodes.filter((node) => node.name !== path[0]);
  return nodes.map((node) => {
    if (node.name !== path[0]) return node;
    return { ...node, children: removeNodeAtPath(node.children || [], path.slice(1)) };
  });
};

const findNodeAtPath = (nodes, path) => {
  let level = nodes;
  let found = null;
  for (const segment of path) {
    found = level?.find((node) => node.name === segment);
    if (!found) return null;
    level = found.children;
  }
  return found;
};

const flattenTree = (nodes, expandedFolders, filterText, parentPath = [], level = 1) => {
  const query = filterText.trim().toLowerCase();
  const rows = [];

  for (const node of nodes) {
    const path = node.path || [...parentPath, node.name];
    const pathStr = getPathStr(path);
    const pathMatches = pathStr.toLowerCase().includes(query);
    const childrenRows =
      node.children && (query || expandedFolders[pathStr] !== false)
        ? flattenTree(node.children, expandedFolders, filterText, path, level + 1)
        : [];

    if (!query || pathMatches || childrenRows.length > 0) {
      rows.push({ key: pathStr, item: node, level, path, pathStr });
      rows.push(...childrenRows);
    }
  }

  return rows;
};

export default function Sidebar() {
  const sidebarState = SidebarState.useState();
  const { isSidebarOpen, folderTree = [], sidebarWidth, expandedFolders = {} } = sidebarState;
  const appState = AppState.useState();
  const { projectName, isMobile, fs } = appState;
  const tabState = TabState.useState();
  const editorState = EditorState.useState();
  const sidebarUiState = SidebarUiState.useState(null, { filterText: '' });
  const { filterText = '' } = sidebarUiState || {};
  const deferredFilterText = useDeferredValue(filterText);
  const [loadingPaths, setLoadingPaths] = useState({});
  const [dropTargetPath, setDropTargetPath] = useState(null);
  const searchInputRef = useRef(null);
  const syncedFsRef = useRef({ files: null, mode: null, version: null });
  const { addNotification } = useNotification();

  useEffect(() => {
    if (!fs.mode) return;

    const previous = syncedFsRef.current;
    if (
      previous.files === fs.files &&
      previous.mode === fs.mode &&
      previous.version === fs.version
    ) {
      return;
    }

    syncedFsRef.current = { files: fs.files, mode: fs.mode, version: fs.version };
    const nextTree = normalizeChildren(fs.files || []);
    sidebarState((draft) => {
      draft.folderTree = nextTree;
      const nextExpanded = { ...(draft.expandedFolders || {}) };
      for (const row of flattenTree(nextTree, {}, '', [], 0)) {
        if (row.item.type === 'folder' && isNodeModulesPath(row.path)) {
          nextExpanded[row.pathStr] = false;
        }
      }
      draft.expandedFolders = nextExpanded;
    });
  }, [fs.files, fs.mode, fs.version, sidebarState]);

  const toggleSidebar = () => {
    sidebarState((draft) => {
      if (isMobile) {
        draft.isSidebarPopupOpen = !draft.isSidebarPopupOpen;
        draft.isAIInputPopupOpen = false;
      } else {
        draft.isSidebarOpen = !draft.isSidebarOpen;
      }
    });
  };

  useEffect(() => {
    const handleFocusSearch = () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener('focus-file-search', handleFocusSearch);
    return () => window.removeEventListener('focus-file-search', handleFocusSearch);
  }, []);

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
    [fs.mode, sidebarState],
  );

  const rows = useMemo(
    () => [
      {
        key: '__root__',
        item: { name: projectName, type: 'folder', path: [], isRoot: true, handle: fs.rootHandle },
        level: 0,
        path: [],
        pathStr: '',
      },
      ...flattenTree(folderTree, expandedFolders, deferredFilterText),
    ],
    [deferredFilterText, expandedFolders, folderTree, fs.rootHandle, projectName],
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
    async (row) => {
      let content = '';
      if (fs.mode === 'local' && row.item.handle && !isMediaFile(row.item.name)) {
        content = await fs.readFile(row.item.handle);
      }

      if (fs.mode !== 'local' && !isMediaFile(row.item.name)) {
        content =
          editorState.fileContents?.[row.pathStr] ?? getInitialFileContents()[row.pathStr] ?? '';
      }

      if (!isMediaFile(row.item.name)) {
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
              file: { ...row.item, path: row.path, content },
              fsHandle: row.item.handle,
            },
          ];
        } else if (!isMediaFile(row.item.name)) {
          existingTab.file = { ...existingTab.file, path: row.path, content };
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
        if (!draft.fileContents) return;
        const nextContents = {};
        for (const key in draft.fileContents) {
          nextContents[
            key === oldPathStr || key.startsWith(`${oldPathStr}/`)
              ? nextPathStr + key.substring(oldPathStr.length)
              : key
          ] = draft.fileContents[key];
        }
        draft.fileContents = nextContents;
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
    [addNotification, editorState, fs, sidebarState, tabState],
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
        if (!draft.fileContents) return;
        for (const key in draft.fileContents) {
          if (key === row.pathStr || key.startsWith(`${row.pathStr}/`))
            delete draft.fileContents[key];
        }
      });

      addNotification(`"${row.item.name}" deleted`, 'info');
    },
    [addNotification, editorState, folderTree, fs, sidebarState, tabState],
  );

  const handleDragStart = useCallback(
    (event, row) => {
      if (row.item.isRoot) {
        event.preventDefault();
        return;
      }
      sidebarState((draft) => {
        draft.draggedItem = {
          path: row.path,
          type: row.item.type,
          handle: row.item.handle,
          name: row.item.name,
        };
      });
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', row.pathStr);
    },
    [sidebarState],
  );

  const handleDragOver = useCallback(
    (event, row) => {
      const draggedItem = sidebarState.draggedItem;
      if (!draggedItem || row.item.type !== 'folder') return;
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
    (_event, row) => {
      const draggedItem = sidebarState.draggedItem;
      if (!draggedItem || row.item.type !== 'folder') return;
      const sourcePath = getPathStr(draggedItem.path);
      if (sourcePath !== row.pathStr && !row.pathStr.startsWith(`${sourcePath}/`)) {
        setDropTargetPath(row.pathStr);
      }
    },
    [sidebarState.draggedItem],
  );

  const handleDrop = useCallback(
    async (event, row) => {
      event.preventDefault();
      setDropTargetPath(null);
      const draggedItem = sidebarState.draggedItem;
      if (!draggedItem || row.item.type !== 'folder') return;
      const sourcePathStr = getPathStr(draggedItem.path);
      const nextPathStr = getPathStr([...row.path, draggedItem.name]);
      if (sourcePathStr === row.pathStr || row.pathStr.startsWith(`${sourcePathStr}/`)) return;

      if (fs.mode === 'local' && draggedItem.handle && row.item.handle) {
        await fs.moveEntry(draggedItem.handle, row.item.handle);
      }

      sidebarState((draft) => {
        draft.draggedItem = null;
        const nextExpanded = {};
        for (const key in draft.expandedFolders) {
          nextExpanded[
            key === sourcePathStr || key.startsWith(`${sourcePathStr}/`)
              ? nextPathStr + key.substring(sourcePathStr.length)
              : key
          ] = draft.expandedFolders[key];
        }
        draft.expandedFolders = nextExpanded;
      });
    },
    [fs, sidebarState],
  );

  const isOpen = isMobile ? sidebarState.isSidebarPopupOpen : isSidebarOpen;
  const [animatedWidth, setAnimatedWidth] = useState(isOpen ? sidebarWidth : 0);

  useEffect(() => {
    if (isMobile) return undefined;
    if (isOpen) {
      const frame = window.requestAnimationFrame(() => setAnimatedWidth(sidebarWidth));
      return () => window.cancelAnimationFrame(frame);
    }
    setAnimatedWidth(sidebarWidth);
    const frame = window.requestAnimationFrame(() => setAnimatedWidth(0));
    return () => window.cancelAnimationFrame(frame);
  }, [isMobile, isOpen, sidebarWidth]);

  const desktopWidth = `${animatedWidth}px`;

  return (
    <aside
      className={`${styles.sidebar} ${isOpen ? styles.isOpen : ''}`}
      aria-hidden={!isOpen}
      style={{
        width: isMobile ? undefined : desktopWidth,
        flexBasis: isMobile ? undefined : desktopWidth,
      }}
    >
      <div className={styles.contentWrapper}>
        <div className={styles.header}>
          <Tooltip
            content={isOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
            shortcut={formatShortcut('⌃B')}
          >
            <button
              type="button"
              onClick={toggleSidebar}
              onKeyDown={(event) => event.key === 'Enter' && toggleSidebar()}
              className={styles.logo}
              aria-label={isOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
              data-testid="sidebar-toggle"
            >
              <Icons.ZLogo size={32} />
            </button>
          </Tooltip>
          <div className={styles.projectNameContainer} style={{ opacity: isOpen ? 1 : 0 }}>
            <span className={styles.tagline}>
              ZAKAMUR<span className={styles.aiHighlight}>AI</span>
            </span>
          </div>
        </div>

        <div className={styles.mountSection}>
          {!fs.mode ? (
            <button type="button" onClick={fs.mountLocal} className={styles.mountButton}>
              <Icons.FolderPlus />
              <span>Open Folder</span>
            </button>
          ) : (
            <button type="button" onClick={fs.mountLocal} className={styles.relinkButton}>
              <Icons.FolderPlus />
              <span>Relink Project</span>
            </button>
          )}
        </div>

        <div className={styles.filterSection}>
          <div className={styles.searchContainer}>
            <div className={styles.searchIcon}>
              <Icons.Search />
            </div>
            <input
              ref={searchInputRef}
              value={filterText}
              onChange={(event) =>
                sidebarUiState((draft) => {
                  draft.filterText = event.target.value;
                })
              }
              placeholder={`Search files (${formatShortcut('⌃P')})`}
              className={styles.searchInput}
            />
          </div>
        </div>

        <VirtualList
          className={`${styles.treeArea} scrollHide`}
          style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
          items={rows}
          itemHeight={ROW_HEIGHT}
          renderItem={(row) => (
            <TreeItem
              row={row}
              filterText={deferredFilterText}
              isActive={tabState.activeTabId === row.pathStr}
              isExpanded={
                row.item.isRoot ||
                !!deferredFilterText ||
                (!!row.item.children && expandedFolders[row.pathStr] !== false)
              }
              isLoading={!!loadingPaths[row.pathStr]}
              isDragged={sidebarState.draggedItem?.path?.join('/') === row.pathStr}
              isDropTarget={dropTargetPath === row.pathStr}
              onToggle={handleToggle}
              onOpenFile={handleOpenFile}
              onRename={handleRename}
              onCreate={handleCreate}
              onDelete={handleDelete}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={() => setDropTargetPath(null)}
              onDrop={handleDrop}
              onDragEnd={() => {
                setDropTargetPath(null);
                sidebarState((draft) => {
                  draft.draggedItem = null;
                });
              }}
            />
          )}
        />
        {rows.length === 1 && !fs.mode && (
          <div className={styles.noFiles}>No files found matching "{filterText}"</div>
        )}
      </div>
    </aside>
  );
}
