import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { Icons } from '@/components/Core/Base/Icons';
import { createState } from '@/components/Core/Base/State';
import { useNotification } from '@/components/Widgets/Notification/Notification';
import { formatShortcut } from '@/utils/os';
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react';
import styles from './Sidebar.module.css';
import useSidebarDragAndDrop from './SidebarDragAndDrop';
import useSidebarFileLoader from './SidebarFileLoader';
import TreeItem from './TreeItem';
import {
  flattenTree,
  getPathStr,
  isNodeModulesPath,
  normalizeChildren,
  setChildrenAtPath,
} from './TreeUtils';
import VirtualList from './VirtualList';

export const SidebarState = createState('SidebarState');
const SidebarUiState = createState('SidebarUiState');

const ROW_HEIGHT = 34;
const COLLAPSED_DESKTOP_WIDTH = 0;

export default function Sidebar() {
  const sidebarState = SidebarState.useState();
  const { isSidebarOpen, folderTree = [], sidebarWidth, expandedFolders = {} } = sidebarState;
  const appState = AppState.useState();
  const { projectName, isMobile, fs } = appState;
  const tabState = TabState.useState();
  const editorState = EditorState.useState();
  const sidebarUiState = SidebarUiState.useState(null, {
    filterText: '',
    loadingPaths: {},
    dropTargetPath: null,
    animatedWidth: sidebarWidth ?? 0,
  });
  const {
    filterText = '',
    loadingPaths = {},
    dropTargetPath = null,
    animatedWidth = sidebarWidth ?? 0,
  } = sidebarUiState || {};
  const setSidebarUiValue = useCallback(
    (key, nextValue) => {
      sidebarUiState((draft) => {
        draft[key] = typeof nextValue === 'function' ? nextValue(draft[key]) : nextValue;
      });
    },
    [sidebarUiState],
  );
  const setLoadingPaths = useCallback(
    (nextValue) => setSidebarUiValue('loadingPaths', nextValue),
    [setSidebarUiValue],
  );
  const setDropTargetPath = useCallback(
    (nextValue) => setSidebarUiValue('dropTargetPath', nextValue),
    [setSidebarUiValue],
  );
  const setAnimatedWidth = useCallback(
    (nextValue) => setSidebarUiValue('animatedWidth', nextValue),
    [setSidebarUiValue],
  );
  const deferredFilterText = useDeferredValue(filterText);
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

  useEffect(() => {
    const handleFocusSearch = () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener('focus-file-search', handleFocusSearch);
    return () => window.removeEventListener('focus-file-search', handleFocusSearch);
  }, []);

  const { handleToggle, handleOpenFile, handleRename, handleCreate, handleDelete } =
    useSidebarFileLoader({
      fs,
      appState,
      sidebarState,
      tabState,
      editorState,
      setLoadingPaths,
      addNotification,
    });

  const { handleDragStart, handleDragOver, handleDragEnter, handleDrop } = useSidebarDragAndDrop({
    fs,
    sidebarState,
    setDropTargetPath,
  });

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

  const isOpen = isMobile ? sidebarState.isSidebarPopupOpen : isSidebarOpen;

  useEffect(() => {
    if (isMobile) return undefined;
    if (isOpen) {
      const frame = window.requestAnimationFrame(() => setAnimatedWidth(sidebarWidth));
      return () => window.cancelAnimationFrame(frame);
    }
    setAnimatedWidth(sidebarWidth);
    const frame = window.requestAnimationFrame(() => setAnimatedWidth(0));
    return () => window.cancelAnimationFrame(frame);
  }, [isMobile, isOpen, sidebarWidth, setAnimatedWidth]);

  const desktopWidth = `${isOpen ? animatedWidth : COLLAPSED_DESKTOP_WIDTH}px`;

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
