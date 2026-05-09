import React from 'react';
import { Icons } from '../Icons';
import styles from './Dashboard.module.css';
import { SidebarState } from '../Sidebar';
import { useNotification } from '../../Widgets/Notification/Notification';

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
          <Icons.Bot size={80} className={styles.logo} />
        </div>
        <h1 className={styles.title}>Zakamurai</h1>
        <p className={styles.subtitle}>Supercharge your coding with AI precision.</p>
      </div>

      <div className={styles.grid}>
        <div className={styles.section}>
          <h3>Quick Start</h3>
          <div className={styles.card} onClick={handleCreateFile}>
            <Icons.Code size={20} />
            <div>
              <p className={styles.cardLabel}>Create a file</p>
              <p className={styles.cardHint}>Use the explorer on the left</p>
            </div>
          </div>
          <div className={styles.card} onClick={handleToggleAI}>
            <Icons.Bot size={20} />
            <div>
              <p className={styles.cardLabel}>Ask AI</p>
              <p className={styles.cardHint}>Click to toggle AI Sidebar</p>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <h3>Keyboard Shortcuts</h3>
          <div className={styles.shortcut}>
            <span>Compile Project</span>
            <kbd>⌘ Enter</kbd>
          </div>
          <div className={styles.shortcut}>
            <span>Toggle Sidebar</span>
            <kbd>⌘ B</kbd>
          </div>
          <div className={styles.shortcut}>
            <span>Toggle AI Panel</span>
            <kbd>⌘ J</kbd>
          </div>
          <div className={styles.shortcut}>
            <span>Clear Logs</span>
            <kbd>⌘ K</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
