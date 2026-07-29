import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import React from 'react';
import type { PromptHeaderProps } from '../prompt-types';
import styles from './Header.module.css';

export default function PromptHeader({
  isAIProcessing,
  isSystemProcessing,
  hasReasoning,
  isReasoningVisible,
  onToggleReasoning,
  mode = 'single',
  onModeChange,
}: PromptHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.titleBlock}>
        <h2 className={styles.title}>Agent</h2>
        <fieldset className={styles.modeToggle} aria-label="Agent mode">
          <button
            type="button"
            className={`${styles.modeBtn} ${mode === 'single' ? styles.modeBtnActive : ''}`}
            onClick={() => onModeChange?.('single')}
            aria-pressed={mode === 'single'}
          >
            Single
          </button>
          <button
            type="button"
            className={`${styles.modeBtn} ${mode === 'team' ? styles.modeBtnActive : ''}`}
            onClick={() => onModeChange?.('team')}
            aria-pressed={mode === 'team'}
          >
            Team
          </button>
        </fieldset>
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
