import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { LogState } from '@/components/App/Views/LogArea';
import { Icons } from '@/components/Core/Base/Icons';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { formatShortcut } from '@/utils/os';
import React from 'react';
import styles from '../TopBar.module.css';

export default function ActionButtons({ onCompile, onOpenLog, onOpenPreview, onToggleAIInput }) {
  const { isSystemProcessing } = LogState.useState('isSystemProcessing');
  const { activeTabId } = TabState.useState('activeTabId');
  const { isMobile } = AppState.useState('isMobile');
  const { showAIInput, isAIInputPopupOpen } = SidebarState.useState([
    'showAIInput',
    'isAIInputPopupOpen',
  ]);
  const isAIInputActive = isMobile ? isAIInputPopupOpen : showAIInput;

  return (
    <div className={styles.actionGroups}>
      <div className={styles.compileGroup}>
        <Tooltip content="Build Project" shortcut={formatShortcut('⌘↵')}>
          <button
            type="button"
            className={styles.compileBtn}
            onClick={onCompile}
            disabled={isSystemProcessing}
            data-testid="compile-btn"
          >
            <Icons.Play />
            <span className={styles.hideOnMobile}>Build</span>
          </button>
        </Tooltip>
      </div>

      <div className={styles.viewTabs}>
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
          content={isAIInputActive ? 'Hide AI Prompt' : 'Show AI Prompt'}
          shortcut={formatShortcut('⌃J')}
        >
          <button
            type="button"
            className={`${styles.sidebarBtn} ${isAIInputActive ? styles.activeSidebar : ''}`}
            onClick={onToggleAIInput}
            aria-label={isAIInputActive ? 'Hide AI Prompt' : 'Show AI Prompt'}
            data-testid="ai-prompt-toggle"
          >
            <Icons.BotSmall />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
