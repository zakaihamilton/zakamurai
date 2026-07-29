import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import React, { useState } from 'react';
import type { PromptHeaderProps } from '../prompt-types';
import styles from './Header.module.css';

export default function PromptHeader({
  isAIProcessing: _isAIProcessing,
  isSystemProcessing,
  hasReasoning,
  isReasoningVisible,
  onToggleReasoning,
  mode = 'single',
  onModeChange,
  copyContent = '',
}: PromptHeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!copyContent) return;
    try {
      await navigator.clipboard.writeText(copyContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failures in unsupported environments
    }
  };

  return (
    <div className={styles.header}>
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
      <div className={styles.headerActions}>
        {isSystemProcessing && <span className={styles.status}>Compiling</span>}
        <Tooltip content={copied ? 'Copied!' : 'Copy full session (transcript & reasoning)'}>
          <button
            type="button"
            className={`${styles.headerActionBtn} ${copied ? styles.headerActionBtnActive : ''}`}
            onClick={handleCopy}
            aria-label={
              copied
                ? 'Copied full session to clipboard'
                : 'Copy full session transcript and reasoning to clipboard'
            }
          >
            {copied ? <Icons.Check /> : <Icons.Copy />}
          </button>
        </Tooltip>
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
