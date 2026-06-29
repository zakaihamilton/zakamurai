import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip/Tooltip';
import React from 'react';
import styles from './PromptContextPanel.module.css';

export default function PromptContextPanel({
  activeFileName,
  activeFilePath,
  selectedLines,
  selectedLineText,
  runState,
}) {
  return (
    <div className={styles.contextPanel} aria-label="AI context">
      <div className={styles.contextRow}>
        <span className={styles.contextLabel}>File</span>
        <Tooltip content={activeFilePath} className={styles.contextTooltip}>
          <span className={styles.contextValue}>
            <Icons.File size={12} />
            {activeFileName}
          </span>
        </Tooltip>
      </div>
      <div className={styles.contextRow}>
        <span className={styles.contextLabel}>Selection</span>
        <span className={styles.contextValue}>
          <Icons.Check size={12} />
          {selectedLines.length > 0 ? `Lines ${selectedLineText}` : selectedLineText}
        </span>
      </div>
      <div className={styles.contextRow}>
        <span className={styles.contextLabel}>State</span>
        <span className={styles.contextValue}>
          <span className={styles.contextDot} />
          {runState}
        </span>
      </div>
    </div>
  );
}
