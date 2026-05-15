import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { Icons } from '@/components/Core/Base/Icons';
import { createState } from '@/components/Core/Base/State';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { formatShortcut } from '@/utils/os';
import React, { useEffect, useMemo, useRef } from 'react';
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

  const isOpen = isMobile ? sidebarState.isSidebarPopupOpen : isSidebarOpen;

  return (
    <aside
      className={`${styles.sidebar} ${isOpen ? styles.isOpen : ''}`}
      style={{
        width: isMobile ? undefined : isOpen ? `${sidebarWidth}px` : '0px',
      }}
    >
      {/* Dynamic Header Section */}
      {isOpen && (
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
      )}

      {/* Mount Section */}
      {isOpen && (
        <div className={styles.mountSection}>
          {!appState.fs.mode ? (
            <button type="button" onClick={appState.fs.mountLocal} className={styles.mountButton}>
              <Icons.FolderPlus />
              <span>Open Folder</span>
            </button>
          ) : (
            <button type="button" onClick={appState.fs.mountLocal} className={styles.relinkButton}>
              <Icons.FolderPlus />
              <span>Relink Project</span>
            </button>
          )}
        </div>
      )}

      {/* Filter Section */}
      {isOpen && (
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
      )}

      {/* File Tree Area */}
      <div
        className={`${styles.treeArea} scroll-hide`}
        style={{
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      >
        <TreeItem
          item={{
            name: projectName,
            type: 'folder',
            path: [],
            isRoot: true,
            children: appState.fs.mode ? undefined : filteredTree,
          }}
          fsHandle={appState.fs.mode ? appState.fs.rootHandle : null}
          filterText={filterText}
          onRename={(newName) => {
            appState((draft) => {
              draft.projectName = newName;
            });
          }}
        />
        {filteredTree.length === 0 && !appState.fs.mode && isOpen && (
          <div className={styles.noFiles}>No files found matching "{filterText}"</div>
        )}
      </div>
    </aside>
  );
}
