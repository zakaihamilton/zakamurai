import { Icons } from '@/components/Core/Base/Icons';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { formatShortcut } from '@/utils/os';
import React from 'react';
import styles from '../TopBar.module.css';

export default function ActionButtons({
  onCompile,
  onOpenLog,
  onOpenPreview,
  isSystemProcessing,
  activeTabId,
  showAIInput,
  onToggleAIInput,
}) {
  return (
    <div className={styles.compileGroup}>
      <Tooltip content="Compile Project" shortcut={formatShortcut('⌘↵')}>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.compileBtn}`}
          onClick={onCompile}
          disabled={isSystemProcessing}
        >
          <Icons.Play />
          <span className={styles.hideOnMobile}>Compile</span>
        </button>
      </Tooltip>
      <Tooltip content="Show Log" shortcut={formatShortcut('⌘U')}>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.terminalToggleBtn} ${activeTabId === 'ai-logs' ? styles.activeTab : ''}`}
          onClick={onOpenLog}
        >
          <Icons.Terminal />
        </button>
      </Tooltip>
      <Tooltip content="Show Preview" shortcut={formatShortcut('⌘I')}>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.terminalToggleBtn} ${activeTabId === 'preview' ? styles.activeTab : ''}`}
          onClick={onOpenPreview}
        >
          <Icons.Globe />
        </button>
      </Tooltip>
      <Tooltip
        content={showAIInput ? 'Hide AI Prompt' : 'Show AI Prompt'}
        shortcut={formatShortcut('⌘J')}
      >
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.iconBtn} ${showAIInput ? styles.activeTab : ''}`}
          onClick={onToggleAIInput}
        >
          <Icons.BotSmall />
        </button>
      </Tooltip>
    </div>
  );
}
