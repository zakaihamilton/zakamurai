import { SidebarState } from '@/components/App/Panes';
import { TabState } from '@/components/App/Panes';
import { Icons } from '@/components/Core/Base/Icons';
import { useNotification } from '@/components/Widgets/Notification/Notification';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { formatShortcut } from '@/utils/os';
import React from 'react';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const sidebarState = SidebarState.useState();
  const tabState = TabState.useState();
  const { addNotification } = useNotification();

  const handleCreateFile = () => {
    sidebarState((draft) => {
      draft.isSidebarOpen = true;
    });
    addNotification('Select a folder in the explorer to create a file', 'info');
  };

  const handleToggleAI = () => {
    sidebarState((draft) => {
      draft.showAIInput = !draft.showAIInput;
    });
  };

  const handleShowInfo = () => {
    const exists = tabState.openTabs.some((t) => t.id === 'project-info');
    if (!exists) {
      tabState.openTabs = [
        ...tabState.openTabs,
        {
          id: 'project-info',
          type: 'project-info',
          label: 'Project Info',
        },
      ];
    }
    tabState.activeTabId = 'project-info';
  };

  return (
    <div className={styles.dashboard}>
      <div className={styles.hero}>
        <div className={styles.logoWrapper}>
          <Icons.ZLogo size={80} className={styles.logo} />
        </div>
        <h1 className={styles.title}>
          Zakamur<span className={styles.aiHighlight}>ai</span>
        </h1>
        <div className={styles.subtitleWrapper}>
          <p className={styles.subtitle}>Supercharge your coding in the browser.</p>
          <Tooltip content="Project Information">
            <button
              type="button"
              className={styles.infoButton}
              onClick={handleShowInfo}
              aria-label="Show project information"
            >
              <Icons.Info size={18} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.section}>
          <h3>Quick Start</h3>
          <button
            type="button"
            className={styles.card}
            onClick={handleCreateFile}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleCreateFile()}
          >
            <Icons.Code size={20} />
            <div>
              <p className={styles.cardLabel}>Create a file</p>
              <p className={styles.cardHint}>Use the explorer on the left</p>
            </div>
          </button>
          <button
            type="button"
            className={styles.card}
            onClick={handleToggleAI}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleToggleAI()}
          >
            <Icons.Bot size={20} />
            <div>
              <p className={styles.cardLabel}>Ask AI</p>
              <p className={styles.cardHint}>Click to toggle AI Sidebar</p>
            </div>
          </button>
        </div>

        <div className={styles.section}>
          <h3>Keyboard Shortcuts</h3>
          <div className={styles.shortcut}>
            <span>Compile Project</span>
            <kbd>{formatShortcut('⌘↵')}</kbd>
          </div>
          <div className={styles.shortcut}>
            <span>Toggle Sidebar</span>
            <kbd>{formatShortcut('⌃B')}</kbd>
          </div>
          <div className={styles.shortcut}>
            <span>Toggle AI Panel</span>
            <kbd>{formatShortcut('⌃J')}</kbd>
          </div>
          <div className={styles.shortcut}>
            <span>Clear Logs</span>
            <kbd>{formatShortcut('⌃K')}</kbd>
          </div>
          <div className={styles.shortcut}>
            <span>Format Code</span>
            <kbd>{formatShortcut('⌥⇧F')}</kbd>
          </div>
        </div>
      </div>
      <div className={styles.footer}>
        <span className={styles.footerText}>Zakai Hamilton</span>
        <a
          href="https://www.linkedin.com/in/zakai-hamilton"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.linkedinLink}
          title="LinkedIn Profile"
        >
          <Icons.Linkedin size={18} />
        </a>
      </div>
    </div>
  );
}
