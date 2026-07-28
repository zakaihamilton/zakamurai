import { Icons } from '@/components/ui/Icons';
import React from 'react';
import { PreviewErrorActions } from './ErrorOverlay';
import styles from './PreviewEmptyState.module.css';

export function PreviewErrorState({ title, message, copied, onCopy, onDismiss }) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>
        <Icons.AlertCircle size={28} />
      </div>
      <h2 className={styles.emptyTitle}>{title}</h2>
      <div className={styles.emptyError} role="alert">
        {message}
      </div>
      {onCopy && onDismiss && (
        <PreviewErrorActions copied={copied} onCopy={onCopy} onDismiss={onDismiss} />
      )}
    </div>
  );
}

export function PreviewUnavailableState() {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>
        <Icons.Globe />
      </div>
      <h2 className={styles.emptyTitle}>No Preview Available</h2>
      <p className={styles.emptyText}>
        Build your project first. The preview will load{' '}
        <code className={styles.code}>dist/index.html</code> from the build output.
      </p>
    </div>
  );
}
