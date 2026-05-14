import { TabState } from '@/components/App/Panes';
import { Icons } from '@/components/Core/Base/Icons';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import React from 'react';
import styles from './Welcome.module.css';

export default function Welcome() {
  const tabState = TabState.useState();

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

  const handleShowInstructions = () => {
    const exists = tabState.openTabs.some((t) => t.id === 'instructions');
    if (!exists) {
      tabState.openTabs = [
        ...tabState.openTabs,
        {
          id: 'instructions',
          type: 'instructions',
          label: 'Instructions',
        },
      ];
    }
    tabState.activeTabId = 'instructions';
  };

  return (
    <div className={styles.welcome}>
      <div className={styles.hero}>
        <div className={styles.logoMark}>
          <Icons.ZLogo size={56} className={styles.logo} />
        </div>
        <p className={styles.eyebrow}>Welcome to Zakamurai</p>
        <h1 className={styles.title}>Your AI coding workspace in the browser.</h1>
        <p className={styles.subtitle}>
          A focused browser workspace for editing, AI-assisted changes, builds, logs, and live
          preview.
        </p>

        <div className={styles.intro}>
          <span>Code</span>
          <span>Prompt</span>
          <span>Build</span>
          <span>Preview</span>
        </div>

        <div className={styles.supportingActions}>
          <Tooltip content="Project Information">
            <button
              type="button"
              className={styles.textAction}
              onClick={handleShowInfo}
              aria-label="Show project information"
            >
              <Icons.Info size={18} />
              <span>Project info</span>
            </button>
          </Tooltip>
          <Tooltip content="Instructions">
            <button
              type="button"
              className={styles.textAction}
              onClick={handleShowInstructions}
              aria-label="Show instructions"
            >
              <Icons.Code size={18} />
              <span>Instructions</span>
            </button>
          </Tooltip>
        </div>

        <footer className={styles.footer}>
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
        </footer>
      </div>
    </div>
  );
}
