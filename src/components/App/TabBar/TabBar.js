import React from 'react';
import { Icons } from '../Icons';
import { ZakamuraiState } from '../State';
import styles from './TabBar.module.css';

export default function TabBar() {
  const state = ZakamuraiState.useState();
  const { openTabs = [], activeTabId } = state;

  const handleTabClick = (tabId) => {
    state((draft) => {
      draft.activeTabId = tabId;

      // Auto-expand sidebar logic
      const tab = draft.openTabs.find((t) => t.id === tabId);
      if (tab && tab.type === 'file' && tab.file.path) {
        // Expand all ancestor folders
        const newExpanded = { ...draft.expandedFolders };
        let runningPath = '';
        for (const seg of tab.file.path.slice(0, -1)) {
          runningPath = runningPath ? `${runningPath}/${seg}` : seg;
          newExpanded[runningPath] = true;
        }
        draft.expandedFolders = newExpanded;
      }
    });
  };

  const closeTab = (e, tabId) => {
    e.stopPropagation();
    state((draft) => {
      if (tabId === 'ai-logs') return;
      const filtered = draft.openTabs.filter((t) => t.id !== tabId);
      draft.openTabs = filtered;
      if (draft.activeTabId === tabId) {
        const newActiveTabId = filtered.length > 0 ? filtered[filtered.length - 1].id : null;
        draft.activeTabId = newActiveTabId;

        const tab = filtered.find((t) => t.id === newActiveTabId);
        if (tab && tab.type === 'file' && tab.file.path) {
          const newExpanded = { ...draft.expandedFolders };
          let runningPath = '';
          for (const seg of tab.file.path.slice(0, -1)) {
            runningPath = runningPath ? `${runningPath}/${seg}` : seg;
            newExpanded[runningPath] = true;
          }
          draft.expandedFolders = newExpanded;
        }
      }
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
                {tab.type === 'logs' ? <Icons.BotSmall /> : <Icons.File />}
              </span>
              {tab.label}
              {!isLogs && (
                <button
                  type="button"
                  onClick={(e) => closeTab(e, tab.id)}
                  onKeyDown={(e) => e.key === 'Enter' && closeTab(e, tab.id)}
                  className={styles.closeButton}
                  style={{ opacity: isActive ? 1 : 0.5 }}
                >
                  <Icons.Close />
                </button>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
