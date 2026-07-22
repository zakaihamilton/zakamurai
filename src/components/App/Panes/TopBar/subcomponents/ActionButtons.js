import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { LogState } from '@/components/App/Views/LogArea';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { formatShortcut } from '@/utils/os';
import React, { useEffect, useMemo, useRef } from 'react';
import styles from '../TopBar.module.css';

const isViewTab = (tabId) => tabId === 'ai-logs' || tabId === 'preview';

export default function ActionButtons({ onCompile, onOpenLog, onOpenPreview, onToggleAIInput }) {
  const { isSystemProcessing } = LogState.useState('isSystemProcessing');
  const tabState = TabState.useState(['activeTabId', 'openTabs', 'lastCodeTabId']);
  const { activeTabId, openTabs = [], lastCodeTabId } = tabState;
  const { isMobile } = AppState.useState('isMobile');
  const { showAIInput, isAIInputPopupOpen } = SidebarState.useState([
    'showAIInput',
    'isAIInputPopupOpen',
  ]);
  const isAIInputActive = isMobile ? isAIInputPopupOpen : showAIInput;
  const lastContentTabIdRef = useRef(lastCodeTabId);
  const lastContentTabId =
    activeTabId && !isViewTab(activeTabId) ? activeTabId : lastContentTabIdRef.current;

  const lastContentTab = useMemo(
    () => openTabs.find((tab) => tab.id === lastContentTabId && !isViewTab(tab.id)),
    [lastContentTabId, openTabs],
  );

  useEffect(() => {
    if (activeTabId && !isViewTab(activeTabId)) {
      lastContentTabIdRef.current = activeTabId;
      tabState((draft) => {
        draft.lastCodeTabId = activeTabId;
      });
    }
  }, [activeTabId, tabState]);

  const handleOpenLastContentTab = () => {
    if (!lastContentTab) return;

    tabState((draft) => {
      draft.activeTabId = lastContentTab.id;
    });
  };

  return (
    <div className={styles.actionGroups}>
      <div className={styles.compileGroup}>
        <Tooltip content="Build Project" shortcut={formatShortcut('⌘↵')}>
          <button
            type="button"
            className={styles.compileBtn}
            onClick={onCompile}
            disabled={isSystemProcessing}
            aria-label="Build project"
            data-testid="compile-btn"
          >
            <Icons.Play />
            <span className={styles.hideOnMobile}>Build</span>
          </button>
        </Tooltip>
      </div>

      <div className={styles.viewTabs}>
        <Tooltip content="Goto Code">
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTabId && !isViewTab(activeTabId) ? styles.activeTab : ''}`}
            onClick={handleOpenLastContentTab}
            aria-label="Goto Code"
            data-testid="code-tab"
            disabled={!lastContentTab}
          >
            <Icons.Code />
          </button>
        </Tooltip>
        <Tooltip content="Goto Logs" shortcut={formatShortcut('⌃U')}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTabId === 'ai-logs' ? styles.activeTab : ''}`}
            onClick={onOpenLog}
            aria-label="Goto Logs"
            data-testid="logs-tab"
          >
            <Icons.Terminal />
          </button>
        </Tooltip>
        <Tooltip content="Goto Preview" shortcut={formatShortcut('⌃I')}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTabId === 'preview' ? styles.activeTab : ''}`}
            onClick={onOpenPreview}
            aria-label="Goto Preview"
            data-testid="preview-tab"
          >
            <Icons.Globe />
          </button>
        </Tooltip>
      </div>

      <div className={styles.sidebarToggleGroup}>
        <Tooltip
          content={isAIInputActive ? 'Hide Agent' : 'Show Agent'}
          shortcut={formatShortcut('⌃J')}
        >
          <button
            type="button"
            className={`${styles.sidebarBtn} ${isAIInputActive ? styles.activeSidebar : ''}`}
            onClick={onToggleAIInput}
            aria-label={isAIInputActive ? 'Hide Agent' : 'Show Agent'}
            data-testid="ai-prompt-toggle"
          >
            <Icons.AIPrompt />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
