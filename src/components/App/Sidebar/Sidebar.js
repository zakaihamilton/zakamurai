import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '../Icons';
import { ZakamuraiState } from '../State';
import styles from './Sidebar.module.css';
import TreeItem from './TreeItem';

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
  const state = ZakamuraiState.useState();
  const { isSidebarOpen, folderTree, showAIInput, projectName } = state;
  const [filterText, setFilterText] = useState('');

  const [isEditingProj, setIsEditingProj] = useState(false);
  const [editProjVal, setEditProjVal] = useState(projectName);

  // Sync project name state if it changes externally
  useEffect(() => {
    setEditProjVal(projectName);
  }, [projectName]);

  const toggleSidebar = () => {
    state((d) => {
      d.isSidebarOpen = !d.isSidebarOpen;
    });
  };

  const submitProjName = () => {
    if (editProjVal.trim() && editProjVal !== projectName) {
      state((draft) => {
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
      </div>

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
        {filteredTree.map((item) => (
          <TreeItem key={item.name} item={{ ...item, path: [item.name] }} filterText={filterText} />
        ))}
        {filteredTree.length === 0 && isSidebarOpen && (
          <div className={styles.noFiles}>No files found matching "{filterText}"</div>
        )}
      </div>

      {/* AI Prompt Footer Toggle */}
      <button
        type="button"
        onClick={() =>
          state((d) => {
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
