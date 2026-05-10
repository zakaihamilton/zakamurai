import { SidebarState } from '@/components/App/Panes/Sidebar';
import { Icons } from '@/components/Core/Base/Icons';
import { useNotification } from '@/components/Widgets/Notification/Notification';
import { formatShortcut } from '@/utils/os';
import React from 'react';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const sidebarState = SidebarState.useState();
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

  return (
    <div className={styles.dashboard}>
      <div className={styles.hero}>
        <div className={styles.logoWrapper}>
          <Icons.ZLogo size={80} className={styles.logo} />
        </div>
        <h1 className={styles.title}>
          Zakamur<span className={styles.aiHighlight}>ai</span>
        </h1>
        <p className={styles.subtitle}>Supercharge your coding with AI precision.</p>
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
            <kbd>{formatShortcut('⌘B')}</kbd>
          </div>
          <div className={styles.shortcut}>
            <span>Toggle AI Panel</span>
            <kbd>{formatShortcut('⌘J')}</kbd>
          </div>
          <div className={styles.shortcut}>
            <span>Clear Logs</span>
            <kbd>{formatShortcut('⌘K')}</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
