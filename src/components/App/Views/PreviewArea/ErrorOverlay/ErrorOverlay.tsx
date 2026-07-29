import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import React from 'react';
import styles from './ErrorOverlay.module.css';

export function PreviewErrorActions({ copied, onCopy, onDismiss }) {
  return (
    <div className={styles.errorActions}>
      <Tooltip content={copied ? 'Copied!' : 'Copy error'}>
        <button
          type="button"
          className={styles.errorActionBtn}
          onClick={onCopy}
          aria-label={copied ? 'Copied!' : 'Copy error'}
        >
          {copied ? <Icons.Check /> : <Icons.Copy />}
        </button>
      </Tooltip>
      <Tooltip content="Dismiss error">
        <button
          type="button"
          className={styles.errorActionBtn}
          onClick={onDismiss}
          aria-label="Dismiss error"
        >
          <Icons.Close />
        </button>
      </Tooltip>
    </div>
  );
}

export function PreviewErrorBanner({ displayError, errorCopied, onCopyError, onDismissError }) {
  if (!displayError) return null;
  return (
    <div className={styles.errorBanner} role="alert">
      <Icons.AlertCircle size={14} />
      <span className={styles.errorText}>{displayError}</span>
      <PreviewErrorActions copied={errorCopied} onCopy={onCopyError} onDismiss={onDismissError} />
    </div>
  );
}
