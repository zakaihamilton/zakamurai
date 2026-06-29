import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip/Tooltip';
import React from 'react';
import styles from './PromptHeader.module.css';

export default function PromptHeader({
  isAIProcessing,
  isSystemProcessing,
  hasReasoning,
  isReasoningVisible,
  onToggleReasoning,
}) {
  return (
    <div className={styles.header}>
      <div>
        <h2 className={styles.title}>AI Prompt</h2>
      </div>
      <div className={styles.headerActions}>
        {isAIProcessing && <span className={styles.status}>AI Working</span>}
        {isSystemProcessing && <span className={styles.status}>Compiling</span>}
        {hasReasoning && (
          <Tooltip content={isReasoningVisible ? 'Hide Reasoning' : 'Show Reasoning'}>
            <button
              type="button"
              className={`${styles.headerActionBtn} ${
                isReasoningVisible ? styles.headerActionBtnActive : ''
              }`}
              onClick={onToggleReasoning}
            >
              <Icons.Brain />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
