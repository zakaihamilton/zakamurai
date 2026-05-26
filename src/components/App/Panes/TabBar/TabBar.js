import { SidebarState } from '@/components/App/Panes/Sidebar';
import { Icons } from '@/components/Core/Base/Icons';
import { createState } from '@/components/Core/Base/State';
import Settings from '@/components/Storage/Settings';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { isMediaFile } from '@/utils/file';
import { FILE_VIEW_TYPES, getFileViewByType } from '@/utils/fileViews';
import React, { useEffect, useState } from 'react';
import styles from './TabBar.module.css';
import TabContextMenu from './TabContextMenu';

export const TabState = createState('TabState');
const TabBarUiState = createState('TabBarUiState');

const getTabViewType = (tab) => {
  if (tab.type === 'file') return getFileViewByType(tab.file?.name, tab.viewType).label;
  if (tab.type === 'token-breakdown') return 'Token Breakdown';
  if (tab.type === 'logs') return 'Logs';
  if (tab.type === 'preview') return 'Preview';
  if (tab.type === 'project-info') return 'Project Info';
  if (tab.type === 'instructions') return 'Instructions';
  return tab.type || 'View';
};

const getTabTooltipContent = (tab) => {
  const target = tab.type === 'file' ? tab.id : tab.sourceFilePath || tab.label;
  return `${getTabViewType(tab)}\n${target}`;
};

export default function TabBar() {
  const tabState = TabState.useState();
  const { openTabs = [], activeTabId } = tabState;
  const sidebarState = SidebarState.useState();
  const [contextMenu, setContextMenu] = useState(null);
  const tabBarUiState = TabBarUiState.useState(null, {
    draggedTabId: null,
    dropTargetId: null,
    isOverBar: false,
  });
  const { draggedTabId = null, dropTargetId = null, isOverBar = false } = tabBarUiState || {};

  const resetDragState = () => {
    tabBarUiState((draft) => {
      draft.draggedTabId = null;
      draft.dropTargetId = null;
      draft.isOverBar = false;
    });
  };

  // Persist open tabs and active tab to localStorage
  useEffect(() => {
    Settings.setOpenTabs(openTabs);
    Settings.setActiveTabId(activeTabId);
  }, [openTabs, activeTabId]);

  const handleTabClick = (tabId) => {
    tabState((draft) => {
      draft.activeTabId = tabId;
    });

    // Auto-expand sidebar logic
    const tab = openTabs.find((t) => t.id === tabId);
    if (tab && tab.type === 'file' && tab.file?.path) {
      sidebarState((draft) => {
        // Expand all ancestor folders
        const newExpanded = { ...draft.expandedFolders };
        let runningPath = '';
        for (const seg of tab.file.path.slice(0, -1)) {
          runningPath = runningPath ? `${runningPath}/${seg}` : seg;
          newExpanded[runningPath] = true;
        }
        draft.expandedFolders = newExpanded;
      });
    }
  };

  const closeTab = (e, tabId) => {
    if (e) e.stopPropagation();
    tabState((draft) => {
      const filtered = draft.openTabs.filter((t) => t.id !== tabId);
      draft.openTabs = filtered;
      if (draft.activeTabId === tabId) {
        const newActiveTabId = filtered.length > 0 ? filtered[filtered.length - 1].id : null;
        draft.activeTabId = newActiveTabId;

        const tab = filtered.find((t) => t.id === newActiveTabId);
        if (tab && tab.type === 'file' && tab.file?.path) {
          sidebarState((draft) => {
            const newExpanded = { ...draft.expandedFolders };
            let runningPath = '';
            for (const seg of tab.file.path.slice(0, -1)) {
              runningPath = runningPath ? `${runningPath}/${seg}` : seg;
              newExpanded[runningPath] = true;
            }
            draft.expandedFolders = newExpanded;
          });
        }
      }
    });
  };

  const closeOtherTabs = (tabId) => {
    tabState((draft) => {
      const clickedTab = draft.openTabs.find((t) => t.id === tabId);
      if (!clickedTab) return;

      draft.openTabs = [clickedTab];
      draft.activeTabId = tabId;

      if (clickedTab.type === 'file' && clickedTab.file?.path) {
        sidebarState((draft) => {
          const newExpanded = { ...draft.expandedFolders };
          let runningPath = '';
          for (const seg of clickedTab.file.path.slice(0, -1)) {
            runningPath = runningPath ? `${runningPath}/${seg}` : seg;
            newExpanded[runningPath] = true;
          }
          draft.expandedFolders = newExpanded;
        });
      }
    });
  };

  const closeTabsToLeft = (tabId) => {
    tabState((draft) => {
      const clickedIndex = draft.openTabs.findIndex((t) => t.id === tabId);
      if (clickedIndex === -1) return;

      const keepTabs = draft.openTabs.slice(clickedIndex);
      const closedTabs = draft.openTabs.slice(0, clickedIndex);

      draft.openTabs = keepTabs;

      const wasActiveClosed = closedTabs.some((t) => t.id === draft.activeTabId);
      if (wasActiveClosed) {
        draft.activeTabId = tabId;

        const tab = keepTabs[keepTabs.length - 1];
        if (tab && tab.type === 'file' && tab.file?.path) {
          sidebarState((draft) => {
            const newExpanded = { ...draft.expandedFolders };
            let runningPath = '';
            for (const seg of tab.file.path.slice(0, -1)) {
              runningPath = runningPath ? `${runningPath}/${seg}` : seg;
              newExpanded[runningPath] = true;
            }
            draft.expandedFolders = newExpanded;
          });
        }
      }
    });
  };

  const closeTabsToRight = (tabId) => {
    tabState((draft) => {
      const clickedIndex = draft.openTabs.findIndex((t) => t.id === tabId);
      if (clickedIndex === -1) return;

      const keepTabs = draft.openTabs.slice(0, clickedIndex + 1);
      const closedTabs = draft.openTabs.slice(clickedIndex + 1);

      draft.openTabs = keepTabs;

      const wasActiveClosed = closedTabs.some((t) => t.id === draft.activeTabId);
      if (wasActiveClosed) {
        draft.activeTabId = tabId;

        const tab = keepTabs[keepTabs.length - 1];
        if (tab && tab.type === 'file' && tab.file?.path) {
          sidebarState((draft) => {
            const newExpanded = { ...draft.expandedFolders };
            let runningPath = '';
            for (const seg of tab.file.path.slice(0, -1)) {
              runningPath = runningPath ? `${runningPath}/${seg}` : seg;
              newExpanded[runningPath] = true;
            }
            draft.expandedFolders = newExpanded;
          });
        }
      }
    });
  };

  const handleClearAll = () => {
    tabState((draft) => {
      draft.openTabs = [];
      draft.activeTabId = null;
    });
  };

  const handleDragStart = (e, tabId) => {
    e.dataTransfer.setData('tabId', tabId);
    e.dataTransfer.effectAllowed = 'move';
    tabBarUiState((draft) => {
      draft.draggedTabId = tabId;
    });
    // Set drag image or ghost effect if desired
  };

  const handleDragOver = (e, tabId) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    tabBarUiState((draft) => {
      draft.isOverBar = false;
      if (tabId !== draggedTabId) {
        draft.dropTargetId = tabId;
      }
    });
  };

  const handleDragEnd = () => {
    resetDragState();
  };

  const handleDrop = (e, targetTabId) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData('tabId');
    if (!draggedId || draggedId === targetTabId) {
      resetDragState();
      return;
    }

    tabState((draft) => {
      const draggedIndex = draft.openTabs.findIndex((t) => t.id === draggedId);
      const targetIndex = draft.openTabs.findIndex((t) => t.id === targetTabId);

      if (draggedIndex !== -1 && targetIndex !== -1) {
        const [draggedTab] = draft.openTabs.splice(draggedIndex, 1);
        draft.openTabs.splice(targetIndex, 0, draggedTab);
      }
    });

    resetDragState();
  };

  const handleDropOnBar = (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('tabId');
    if (!draggedId) return;

    tabState((draft) => {
      const draggedIndex = draft.openTabs.findIndex((t) => t.id === draggedId);
      if (draggedIndex !== -1) {
        const [draggedTab] = draft.openTabs.splice(draggedIndex, 1);
        draft.openTabs.push(draggedTab);
      }
    });

    resetDragState();
  };

  if (openTabs.length === 0) return null;

  return (
    <div
      className={`${styles.tabBarContainer} ${isOverBar ? styles.barDropTarget : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        tabBarUiState((draft) => {
          draft.isOverBar = true;
          draft.dropTargetId = null;
        });
      }}
      onDragLeave={() =>
        tabBarUiState((draft) => {
          draft.isOverBar = false;
        })
      }
      onDrop={handleDropOnBar}
    >
      <div className={`${styles.tabBar} scrollHide`}>
        {openTabs.map((tab) => {
          const isActive = activeTabId === tab.id;
          const isDragging = draggedTabId === tab.id;
          const isDropTarget = dropTargetId === tab.id;

          return (
            <React.Fragment key={tab.id}>
              {/* biome-ignore lint/a11y/useSemanticElements: nesting buttons is invalid HTML */}
              <div
                role="button"
                tabIndex={0}
                draggable
                onDragStart={(e) => handleDragStart(e, tab.id)}
                onDragOver={(e) => handleDragOver(e, tab.id)}
                onDragEnd={handleDragEnd}
                onDrop={(e) => handleDrop(e, tab.id)}
                onClick={() => handleTabClick(tab.id)}
                onKeyDown={(e) => e.key === 'Enter' && handleTabClick(tab.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    tab,
                    position: { x: e.clientX, y: e.clientY },
                  });
                }}
                className={`${styles.tab} ${isActive ? styles.activeTab : styles.inactiveTab} ${
                  isDragging ? styles.tabDragging : ''
                } ${isDropTarget ? styles.dropTarget : ''}`}
              >
                <span className={`${styles.tabIcon} ${isActive ? styles.tabIconActive : ''}`}>
                  {tab.type === 'logs' ? (
                    <Icons.BotSmall />
                  ) : tab.type === 'preview' ? (
                    <Icons.Globe />
                  ) : tab.type === 'project-info' ? (
                    <Icons.Info />
                  ) : tab.type === 'token-breakdown' ? (
                    <Icons.Tokens size={14} />
                  ) : tab.viewType === FILE_VIEW_TYPES.IMAGE_VIEWER || isMediaFile(tab.file?.name) ? (
                    <Icons.Image />
                  ) : tab.viewType === FILE_VIEW_TYPES.TOKEN_BREAKDOWN ? (
                    <Icons.Tokens size={14} />
                  ) : (
                    <Icons.File />
                  )}
                </span>
                <Tooltip content={getTabTooltipContent(tab)} className={styles.tabLabelTooltip}>
                  <span className={styles.tabLabelText}>{tab.label}</span>
                </Tooltip>
                <Tooltip content="Close Tab" shortcut="⌃W">
                  <button
                    type="button"
                    onClick={(e) => closeTab(e, tab.id)}
                    onKeyDown={(e) => e.key === 'Enter' && closeTab(e, tab.id)}
                    className={styles.closeButton}
                    style={{ opacity: isActive ? 1 : 0.5 }}
                    aria-label="Close Tab"
                  >
                    <Icons.Close />
                  </button>
                </Tooltip>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      {openTabs.length > 1 && (
        <div className={styles.tabActions}>
          <Tooltip content="Close all tabs" shortcut="⌃⇧W">
            <button
              type="button"
              onClick={handleClearAll}
              className={styles.clearAllButton}
              aria-label="Close all tabs"
            >
              <Icons.ListX />
            </button>
          </Tooltip>
        </div>
      )}
      {contextMenu && (
        <TabContextMenu
          tab={contextMenu.tab}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onCloseTab={(id) => closeTab(null, id)}
          onCloseOthers={closeOtherTabs}
          onCloseToLeft={closeTabsToLeft}
          onCloseToRight={closeTabsToRight}
          onCloseAll={handleClearAll}
        />
      )}
    </div>
  );
}
