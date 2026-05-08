import React from 'react';
import { Icons } from '../../Icons';
import Tooltip from '../../../Widgets/Tooltip/Tooltip';
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
      <Tooltip content="Compile Project">
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.compileBtn}`}
          onClick={onCompile}
          disabled={isProcessing}
        >
          <Icons.Play />
          <span>Compile</span>
        </button>
      </Tooltip>
      <Tooltip content="Show Log">
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.terminalToggleBtn} ${activeTabId === 'ai-logs' ? styles.activeTab : ''}`}
          onClick={onOpenLog}
        >
          <Icons.Terminal />
        </button>
      </Tooltip>
      <Tooltip content="Show Preview">
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.terminalToggleBtn} ${activeTabId === 'preview' ? styles.activeTab : ''}`}
          onClick={onOpenPreview}
        >
          <Icons.Globe />
        </button>
      </Tooltip>
      <Tooltip content={showAIInput ? 'Hide AI Prompt' : 'Show AI Prompt'}>
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
