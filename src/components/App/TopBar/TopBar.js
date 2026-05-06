import React from 'react';
import { Icons } from '../Icons';
import { ZakamuraiState } from '../State';
import Tooltip from '../../Widgets/Tooltip/Tooltip';
import styles from './TopBar.module.css';

export default function TopBar() {
  const state = ZakamuraiState.useState();
  const { openTabs = [], activeTabId, theme } = state;
  const activeTab = openTabs.find((t) => t.id === activeTabId);

  const toggleTheme = () => {
    state((draft) => {
      draft.theme = draft.theme === 'light' ? 'dark' : 'light';
    });
  };

  // Build Breadcrumb
  let breadcrumb = ['Zakamurai'];
  if (activeTab) {
    if (activeTab.type === 'file') {
      breadcrumb = activeTab.file.path || [activeTab.label];
    } else if (activeTab.type === 'logs') {
      breadcrumb = ['System', 'AI Output'];
    }
  }

  const handleBreadcrumbClick = (_seg, index) => {
    // Reconstruct the full path string up to this segment
    const pathSegments = breadcrumb.slice(0, index + 1);
    const fullPath = pathSegments.join('/');

    state((draft) => {
      draft.expandedFolders = {
        ...draft.expandedFolders,
        [fullPath]: !draft.expandedFolders[fullPath],
      };
    });
  };

  return (
    <header className={styles.header}>
      <div className={styles.breadcrumb}>
        {breadcrumb.map((seg, i) => (
          <React.Fragment key={breadcrumb.slice(0, i + 1).join('/')}>
            <button
              type="button"
              onClick={() => handleBreadcrumbClick(seg, i)}
              onKeyDown={(e) => e.key === 'Enter' && handleBreadcrumbClick(seg, i)}
              className={`${styles.breadcrumbSegment} ${i === breadcrumb.length - 1 ? styles.active : ''}`}
            >
              {seg}
            </button>
            {i < breadcrumb.length - 1 && <Icons.ChevronRight />}
          </React.Fragment>
        ))}
      </div>
      <div className={styles.actions}>
        <Tooltip content={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
          <button
            type="button"
            onClick={toggleTheme}
            className={styles.themeToggle}
          >
            {theme === 'light' ? <Icons.Moon /> : <Icons.Sun />}
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
