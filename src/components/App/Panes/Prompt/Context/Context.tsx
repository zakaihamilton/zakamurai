import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import React from 'react';
import type { PromptContextPanelProps } from '../prompt-types';
import styles from './Context.module.css';

export default function PromptContextPanel({
  scope = 'file',
  onScopeChange = () => {},
  activeFileName,
  activeFilePath,
  selectedLines,
  selectedLineText,
  runState,
}: PromptContextPanelProps) {
  return (
    <div className={styles.contextPanel} aria-label="AI context">
      <div className={styles.contextRow}>
        <span className={styles.contextLabel}>Scope</span>
        <fieldset className={styles.scopeControl} aria-label="Prompt scope">
          {['file', 'project'].map((option) => (
            <button
              key={option}
              type="button"
              className={`${styles.scopeButton} ${scope === option ? styles.scopeButtonActive : ''}`}
              aria-pressed={scope === option}
              onClick={() => onScopeChange(option)}
            >
              {option === 'file' ? 'File' : 'Project'}
            </button>
          ))}
        </fieldset>
      </div>
      <div className={styles.contextRow}>
        <span className={styles.contextLabel}>Target</span>
        <Tooltip
          content={scope === 'project' ? 'Entire workspace' : activeFilePath}
          className={styles.contextTooltip}
        >
          <span className={styles.contextValue}>
            <Icons.File size={12} />
            {scope === 'project' ? 'Whole project' : activeFileName}
          </span>
        </Tooltip>
      </div>
      {scope === 'file' && (
        <div className={styles.contextRow}>
          <span className={styles.contextLabel}>Selection</span>
          <span className={styles.contextValue}>
            <Icons.Check size={12} />
            {selectedLines.length > 0 ? `Lines ${selectedLineText}` : selectedLineText}
          </span>
        </div>
      )}
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
