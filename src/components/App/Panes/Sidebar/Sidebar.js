import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { Icons } from '@/components/Core/Base/Icons';
import { createState } from '@/components/Core/Base/State';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import VirtualList from '@/components/Widgets/VirtualList/VirtualList';
import { formatShortcut } from '@/utils/os';
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import styles from './Sidebar.module.css';
import TreeItem from './TreeItem';

export const SidebarState = createState('SidebarState');
const SidebarUiState = createState('SidebarUiState');

const treeSorter = (a, b) => {
  if (a.type === b.type) {
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  }
  return a.type === 'folder' ? -1 : 1;
};

// Filter the folder tree recursively based on the search input
const filterTree = (nodes, query) => {
  if (!query) return nodes.sort(treeSorter);
  const q = query.toLowerCase();
  return nodes
    .map((node) => {
      if (node.type === 'folder') {
        const filteredChildren = filterTree(node.children || [], query);
        if (node.name.toLowerCase().includes(q) || filteredChildren.length > 0) {
          return { ...node, children: filteredChildren.sort(treeSorter) };
        }
        return null;
      }
      return node.name.toLowerCase().includes(q) ? node : null;
    })
    .filter(Boolean)
    .sort(treeSorter);
};

export default function Sidebar() {
  const sidebarState = SidebarState.useState();
  const { isSidebarOpen, folderTree, sidebarWidth } = sidebarState;
  const appState = AppState.useState();
  const { projectName, isMobile } = appState;
  const sidebarUiState = SidebarUiState.useState(null, { filterText: '' });
  const { filterText = '' } = sidebarUiState || {};
  const [fsCache, setFsCache] = useState({});

  const toggleSidebar = () => {
    sidebarState((d) => {
      if (isMobile) {
        d.isSidebarPopupOpen = !d.isSidebarPopupOpen;
        d.isAIInputPopupOpen = false;
      } else {
        d.isSidebarOpen = !d.isSidebarOpen;
      }
    });
  };

  const searchInputRef = useRef(null);

  useEffect(() => {
    const handleFocusSearch = () => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.select();
      }
    };
    window.addEventListener('focus-file-search', handleFocusSearch);
    return () => window.removeEventListener('focus-file-search', handleFocusSearch);
  }, []);

  const filteredTree = useMemo(() => {
    const nodes = [...folderTree];
    return filterTree(nodes, filterText);
  }, [folderTree, filterText]);

  // Recursively fetch lazy local FS handles for expanded directories
  const fetchLocalDirs = useCallback(async (handle, currentPathStr) => {
    if (!handle || handle.kind !== 'directory') return [];
    const entries = [];
    try {
      for await (const [name, childHandle] of handle.entries()) {
        entries.push({
          name,
          kind: childHandle.kind,
          handle: childHandle,
          type: childHandle.kind === 'directory' ? 'folder' : 'file',
          path: currentPathStr ? currentPathStr.split('/').concat(name) : [name],
        });
      }
      entries.sort(treeSorter);
    } catch (e) {
      console.warn('Failed to fetch local directory', e);
    }
    return entries;
  }, []);

  const { expandedFolders = {} } = sidebarState;

  // biome-ignore lint/correctness/useExhaustiveDependencies: we need to trigger re-fetches when fs.version changes
  useEffect(() => {
    if (!appState.fs.mode || appState.fs.mode !== 'local' || !appState.fs.rootHandle) return;

    // Load root folder
    const pathsToLoad = Object.keys(expandedFolders).filter((p) => expandedFolders[p] === true);

    // Root folder is always expanded implicitly
    if (!pathsToLoad.includes('')) {
      pathsToLoad.push('');
    }

    const loadExpandedDirs = async () => {
      if (pathsToLoad.length === 0) return;

      let changed = false;
      const newCacheEntries = {};

      for (const p of pathsToLoad) {
        try {
          let curr = appState.fs.rootHandle;
          let ok = true;
          if (p !== '') {
            const parts = p.split('/');
            for (const part of parts) {
              curr = await curr.getDirectoryHandle(part);
              if (!curr) {
                ok = false;
                break;
              }
            }
          }
          if (ok) {
            const entries = await fetchLocalDirs(curr, p);
            newCacheEntries[p] = entries;
            changed = true;
          }
        } catch (_e) {
          // ignore
        }
      }

      if (changed) {
        setFsCache((prev) => ({ ...prev, ...newCacheEntries }));
      }
    };

    loadExpandedDirs();
  }, [
    expandedFolders,
    appState.fs.rootHandle,
    appState.fs.mode,
    appState.fs.version,
    fetchLocalDirs,
  ]);

  const flattenTree = useMemo(() => {
    const rootNode = {
      name: projectName,
      type: 'folder',
      path: [],
      isRoot: true,
      children: appState.fs.mode === 'local' ? fsCache[''] || [] : filteredTree,
      handle: appState.fs.mode === 'local' ? appState.fs.rootHandle : null,
    };

    const flat = [];
    const recurse = (node, level, parentHandle) => {
      flat.push({ ...node, level, parentHandle });
      if (node.type === 'folder') {
        const pathStr = node.path.join('/');
        const storedExpanded = expandedFolders[pathStr];
        const isExpanded = filterText
          ? true
          : storedExpanded !== undefined
            ? storedExpanded
            : !pathStr.includes('node_modules');

        if (isExpanded) {
          let childrenToRender = node.children;
          if (appState.fs.mode === 'local' && node.handle) {
            childrenToRender = fsCache[pathStr] || [];
          }

          if (childrenToRender) {
            for (const child of childrenToRender) {
              recurse(
                {
                  ...child,
                  path: [...node.path, child.name],
                },
                level + 1,
                node.handle,
              );
            }
          }
        }
      }
    };

    recurse(rootNode, 0, null);
    return flat;
  }, [
    projectName,
    appState.fs.mode,
    appState.fs.rootHandle,
    filteredTree,
    fsCache,
    expandedFolders,
    filterText,
  ]);

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

  const handleMountLocal = async () => {
    const handle = await appState.fs.mountLocal();
    if (handle) {
      appState((draft) => {
        draft.projectName = handle.name;
      });
    }
  };

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
              onKeyDown={(e) => e.key === 'Enter' && toggleSidebar()}
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
          {!appState.fs.mode ? (
            <button type="button" onClick={handleMountLocal} className={styles.mountButton}>
              <Icons.FolderPlus />
              <span>Open Folder</span>
            </button>
          ) : (
            <button type="button" onClick={handleMountLocal} className={styles.relinkButton}>
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
              onChange={(e) =>
                sidebarUiState((draft) => {
                  draft.filterText = e.target.value;
                })
              }
              placeholder={`Search files (${formatShortcut('⌃P')})`}
              className={styles.searchInput}
            />
          </div>
        </div>

        <div
          className={`${styles.treeArea} scrollHide`}
          style={{
            pointerEvents: isOpen ? 'auto' : 'none',
          }}
        >
          <VirtualList
            items={flattenTree}
            itemHeight={34}
            renderItem={(item, _index) => (
              <TreeItem
                item={item}
                level={item.level}
                filterText={filterText}
                fsHandle={item.handle}
                parentHandle={item.parentHandle}
                onRename={
                  item.isRoot
                    ? (newName) => {
                        appState((draft) => {
                          draft.projectName = newName;
                        });
                      }
                    : null
                }
              />
            )}
          />
          {filteredTree.length === 0 && !appState.fs.mode && (
            <div className={styles.noFiles}>No files found matching "{filterText}"</div>
          )}
        </div>
      </div>
    </aside>
  );
}
