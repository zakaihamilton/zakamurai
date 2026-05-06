import React from 'react';
import { createState } from '../../Core/Base/State';
import Settings from '../../Storage/Settings';
import Tooltip from '../../Widgets/Tooltip/Tooltip';
import { Icons } from '../Icons';
import { SidebarState } from '../Sidebar';
import styles from './TabBar.module.css';

export const TabState = createState('TabState');

export default function TabBar() {
  const tabState = TabState.useState();
  const { openTabs = [], activeTabId } = tabState;
  const sidebarState = SidebarState.useState();

  // Persist open tabs and active tab to localStorage
  React.useEffect(() => {
    Settings.setOpenTabs(openTabs);
    if (activeTabId) {
      Settings.setActiveTabId(activeTabId);
    }
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
    e.stopPropagation();
    tabState((draft) => {
      if (tabId === 'ai-logs') return;
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

  const handleClearAll = () => {
    tabState((draft) => {
      draft.openTabs = draft.openTabs.filter((t) => t.id === 'ai-logs');
      draft.activeTabId = 'ai-logs';
    });
  };

  if (openTabs.length === 0) return null;

  return (
    <div className={`${styles.tabBar} scroll-hide`}>
      {openTabs.map((tab) => {
        const isActive = activeTabId === tab.id;
        const isLogs = tab.id === 'ai-logs';
        return (
          <React.Fragment key={tab.id}>
            {/* biome-ignore lint/a11y/useSemanticElements: nesting buttons is invalid HTML */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleTabClick(tab.id)}
              onKeyDown={(e) => e.key === 'Enter' && handleTabClick(tab.id)}
              className={`${styles.tab} ${isActive ? styles.activeTab : styles.inactiveTab}`}
            >
              <span className={`${styles.tabIcon} ${isActive ? styles.tabIconActive : ''}`}>
                {tab.type === 'logs' ? (
                  <Icons.BotSmall />
                ) : tab.type === 'preview' ? (
                  <Icons.Globe />
                ) : (
                  <Icons.File />
                )}
              </span>
              <Tooltip
                content={tab.type === 'file' ? tab.id : tab.label}
                className={styles.tabLabelTooltip}
              >
                <span className={styles.tabLabelText}>{tab.label}</span>
              </Tooltip>
              {!isLogs && (
                <Tooltip content="Close Tab">
                  <button
                    type="button"
                    onClick={(e) => closeTab(e, tab.id)}
                    onKeyDown={(e) => e.key === 'Enter' && closeTab(e, tab.id)}
                    className={styles.closeButton}
                    style={{ opacity: isActive ? 1 : 0.5 }}
                  >
                    <Icons.Close />
                  </button>
                </Tooltip>
              )}
            </div>
          </React.Fragment>
        );
      })}
      {openTabs.length > 1 && (
        <div className={styles.tabActions}>
          <Tooltip content="Close all tabs">
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
    </div>
  );
}
