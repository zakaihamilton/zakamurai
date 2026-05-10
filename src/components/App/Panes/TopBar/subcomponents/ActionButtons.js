import { Icons } from '@/components/Core/Base/Icons';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { formatShortcut } from '@/utils/os';
import React from 'react';
import styles from '../TopBar.module.css';

export default function ActionButtons({
  onCompile,
  onOpenLog,
  onOpenPreview,
  isProcessing,
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
          disabled={isProcessing}
          aria-label="Compile Project"
        >
          <Icons.Play />
          <span>Compile</span>
        </button>
      </Tooltip>
      <Tooltip content="Show Log" shortcut={formatShortcut('⌘U')}>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.terminalToggleBtn} ${activeTabId === 'ai-logs' ? styles.activeTab : ''}`}
          onClick={onOpenLog}
          aria-label="Show Log"
        >
          <Icons.Terminal />
        </button>
      </Tooltip>
      <Tooltip content="Show Preview" shortcut={formatShortcut('⌘I')}>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.terminalToggleBtn} ${activeTabId === 'preview' ? styles.activeTab : ''}`}
          onClick={onOpenPreview}
          aria-label="Show Preview"
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
          aria-label={showAIInput ? 'Hide AI Prompt' : 'Show AI Prompt'}
        >
          <Icons.BotSmall />
        </button>
      </Tooltip>
    </div>
  );
}
