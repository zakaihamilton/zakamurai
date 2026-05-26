import { Icons } from '@/components/Core/Base/Icons';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { formatShortcut } from '@/utils/os';
import React from 'react';
import styles from './PromptComposer.module.css';

export default function PromptComposer({
  value,
  onChange,
  onKeyDown,
  onSubmit,
  onStop,
  isAIProcessing,
  isButtonActive,
  isOpen,
}) {
  return (
    <form onSubmit={onSubmit} className={styles.form}>
      <textarea
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        disabled={isAIProcessing || !isOpen}
        placeholder={
          isAIProcessing ? 'AI is working... Please wait.' : 'Enter the AI prompt here...'
        }
        className={styles.input}
        tabIndex={isOpen ? undefined : -1}
      />
      <div className={styles.actions}>
        {isAIProcessing && (
          <Tooltip content="Stop AI" shortcut={formatShortcut('⌘.')}>
            <button
              type="button"
              onClick={onStop}
              className={`${styles.button} ${styles.stopButton}`}
              tabIndex={isOpen ? undefined : -1}
            >
              <Icons.Close />
            </button>
          </Tooltip>
        )}
        <Tooltip content="Execute prompt" shortcut="↵">
          <button
            type="submit"
            disabled={!isButtonActive || !isOpen}
            className={`${styles.button} ${
              isButtonActive ? styles.buttonActive : styles.buttonDisabled
            }`}
            tabIndex={isOpen ? undefined : -1}
          >
            <Icons.Send />
          </button>
        </Tooltip>
      </div>
    </form>
  );
}
