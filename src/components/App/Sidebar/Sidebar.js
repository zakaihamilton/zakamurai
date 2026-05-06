import React, { useState, useEffect, useMemo } from 'react';
import { createState } from '../../Core/Base/State';
import { Icons } from '../Icons';
import { AppState } from '../App';
import styles from './Sidebar.module.css';
import TreeItem from './TreeItem';

export const SidebarState = createState('SidebarState');

// Filter the folder tree recursively based on the search input
const filterTree = (nodes, query) => {
  if (!query) return nodes;
  const q = query.toLowerCase();
  return nodes
    .map((node) => {
      if (node.type === 'folder') {
        const filteredChildren = filterTree(node.children || [], query);
        if (node.name.toLowerCase().includes(q) || filteredChildren.length > 0) {
          return { ...node, children: filteredChildren };
        }
        return null;
      }
      return node.name.toLowerCase().includes(q) ? node : null;
    })
    .filter(Boolean);
};

export default function Sidebar() {
  const sidebarState = SidebarState.useState();
  const { isSidebarOpen, folderTree, showAIInput } = sidebarState;
  const appState = AppState.useState();
  const { projectName } = appState;
  const [filterText, setFilterText] = useState('');

  const [isEditingProj, setIsEditingProj] = useState(false);
  const [editProjVal, setEditProjVal] = useState(projectName);

  // Sync project name state if it changes externally
  useEffect(() => {
    setEditProjVal(projectName);
  }, [projectName]);

  const toggleSidebar = () => {
    sidebarState((d) => {
      d.isSidebarOpen = !d.isSidebarOpen;
    });
  };

  const submitProjName = () => {
    if (editProjVal.trim() && editProjVal !== projectName) {
      appState((draft) => {
        draft.projectName = editProjVal.trim();
      });
    }
    setIsEditingProj(false);
  };

  const filteredTree = useMemo(() => filterTree(folderTree, filterText), [folderTree, filterText]);

  return (
    <aside className={styles.sidebar} style={{ width: isSidebarOpen ? '260px' : '64px' }}>
      {/* Dynamic Header Section */}
      <div className={styles.header}>
        <button
          type="button"
          onClick={toggleSidebar}
          onKeyDown={(e) => e.key === 'Enter' && toggleSidebar()}
          className={styles.logo}
        >
          Z
        </button>
        <div className={styles.projectNameContainer} style={{ opacity: isSidebarOpen ? 1 : 0 }}>
          {isEditingProj ? (
            <input
              value={editProjVal}
              onChange={(e) => setEditProjVal(e.target.value)}
              onBlur={submitProjName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitProjName();
                if (e.key === 'Escape') setIsEditingProj(false);
              }}
              className={styles.projectInput}
            />
          ) : (
            <span onDoubleClick={() => setIsEditingProj(true)} className={styles.projectName}>
              {projectName}
            </span>
          )}
          <span className={styles.tagline}>ZAKAMURAI</span>
        </div>
        {isSidebarOpen && (
          <button
            type="button"
            onClick={appState.fs.mountLocal}
            className={styles.headerIconBtn}
            title="Open Folder"
          >
            <Icons.FolderPlus />
          </button>
        )}
      </div>

      {/* Mount Section (Only if nothing mounted) */}
      {isSidebarOpen && !appState.fs.mode && (
        <div className={styles.mountSection}>
          <button type="button" onClick={appState.fs.mountLocal} className={styles.mountButton}>
            <Icons.FolderPlus />
            <span>Open Folder</span>
          </button>
        </div>
      )}

      {/* Filter Section */}
      {isSidebarOpen && (
        <div className={styles.filterSection}>
          <div className={styles.searchContainer}>
            <div className={styles.searchIcon}>
              <Icons.Search />
            </div>
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search files..."
              className={styles.searchInput}
            />
          </div>
        </div>
      )}

      {/* File Tree Area */}
      <div className={`${styles.treeArea} scroll-hide`} style={{ opacity: isSidebarOpen ? 1 : 0 }}>
        {appState.fs.mode
          ? appState.fs.files.map((item) => (
              <TreeItem
                key={item.name}
                item={{ ...item, path: [item.name], type: item.kind === 'directory' ? 'folder' : 'file' }}
                filterText={filterText}
                fsHandle={item.handle}
                parentHandle={appState.fs.rootHandle}
              />
            ))
          : filteredTree.map((item) => (
              <TreeItem key={item.name} item={{ ...item, path: [item.name] }} filterText={filterText} parentHandle={appState.fs.rootHandle} />
            ))}
        {filteredTree.length === 0 && !appState.fs.mode && isSidebarOpen && (
          <div className={styles.noFiles}>No files found matching "{filterText}"</div>
        )}
      </div>

      {/* AI Prompt Footer Toggle */}
      <button
        type="button"
        onClick={() =>
          sidebarState((d) => {
            d.showAIInput = !d.showAIInput;
          })
        }
        className={styles.footerToggle}
        style={{
          justifyContent: isSidebarOpen ? 'flex-start' : 'center',
          color: showAIInput ? 'var(--accent)' : 'var(--text-muted)',
        }}
      >
        {showAIInput ? <Icons.ToggleOn /> : <Icons.ToggleOff />}
        {isSidebarOpen && <span className={styles.footerToggleLabel}>AI PROMPT</span>}
      </button>
    </aside>
  );
}
