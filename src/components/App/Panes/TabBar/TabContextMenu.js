import ContextMenu from '@/components/ui/ContextMenu/ContextMenu';
import { Icons } from '@/components/ui/Icons';
import { isMediaFile } from '@/utils/file';
import React from 'react';
import styles from './TabContextMenu.module.css';

export default function TabContextMenu({
  tab,
  position,
  onClose,
  onCloseTab,
  onCloseOthers,
  onCloseToLeft,
  onCloseToRight,
  onCloseAll,
}) {
  if (!tab) return null;

  const getSubLabel = () => {
    if (tab.type === 'file') {
      return `/${tab.id}`;
    }
    if (tab.type === 'logs') {
      return 'AI Logs';
    }
    if (tab.type === 'preview') {
      return 'Preview Pane';
    }
    if (tab.type === 'project-info') {
      return 'Project Info';
    }
    return 'System Tab';
  };

  return (
    <ContextMenu position={position} onClose={onClose}>
      <div className={styles.contextMenuHeader}>
        <span className={`${styles.headerTypeIcon} ${styles.headerTypeIconAccent}`}>
          {tab.type === 'logs' ? (
            <Icons.BotSmall />
          ) : tab.type === 'preview' ? (
            <Icons.Globe />
          ) : tab.type === 'project-info' ? (
            <Icons.Info />
          ) : isMediaFile(tab.file?.name) ? (
            <Icons.Image />
          ) : (
            <Icons.File />
          )}
        </span>
        <div className={styles.headerTextContainer}>
          <span className={styles.headerName} title={tab.label}>
            {tab.label}
          </span>
          <span className={styles.headerPath} title={getSubLabel()}>
            {getSubLabel()}
          </span>
        </div>
      </div>
      <div className={styles.divider} />

      <button
        type="button"
        onClick={() => {
          onCloseTab(tab.id);
          onClose();
        }}
        className={styles.contextMenuOption}
      >
        <Icons.Close />
        Close Tab
      </button>

      <button
        type="button"
        onClick={() => {
          onCloseOthers(tab.id);
          onClose();
        }}
        className={styles.contextMenuOption}
      >
        {/* Custom SVG icon for "Close Others" */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="5" width="14" height="14" rx="2" ry="2" />
          <path d="M16 9h4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-2" />
          <line x1="8" y1="10" x2="12" y2="14" />
          <line x1="12" y1="10" x2="8" y2="14" />
        </svg>
        Close Others
      </button>

      <button
        type="button"
        onClick={() => {
          onCloseToLeft(tab.id);
          onClose();
        }}
        className={styles.contextMenuOption}
      >
        {/* Custom SVG icon for "Close to the Left" */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="20" y1="12" x2="8" y2="12" />
          <polyline points="14 6 8 12 14 18" />
          <line x1="4" y1="6" x2="4" y2="18" />
        </svg>
        Close to the Left
      </button>

      <button
        type="button"
        onClick={() => {
          onCloseToRight(tab.id);
          onClose();
        }}
        className={styles.contextMenuOption}
      >
        {/* Custom SVG icon for "Close to the Right" */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="4" y1="12" x2="16" y2="12" />
          <polyline points="10 6 16 12 10 18" />
          <line x1="20" y1="6" x2="20" y2="18" />
        </svg>
        Close to the Right
      </button>

      <div className={styles.divider} />

      <button
        type="button"
        onClick={() => {
          onCloseAll();
          onClose();
        }}
        className={`${styles.deleteOption} ${styles.contextMenuOption}`}
      >
        <Icons.ListX />
        Close All Tabs
      </button>
    </ContextMenu>
  );
}
