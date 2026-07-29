import { ChangeSetState } from '@/components/Workspace';
import React from 'react';
import styles from './ChangeSet.module.css';
import { requireStore } from '../../../types';

export default function ChangeSetPanel() {
  const state = requireStore(ChangeSetState.useState(['activeId', 'items']));
  const changeSet = (state.items || []).find((item) => item.id === state.activeId);
  if (!changeSet) return null;
  const reviewed = changeSet.files.filter(
    (file) => file.status && file.status !== 'pending-review',
  ).length;
  return (
    <section className={styles.panel} aria-label="AI change set review">
      <div className={styles.header}>
        <span>Change set</span>
        <span className={styles.status}>{changeSet.status}</span>
      </div>
      <p className={styles.request}>{changeSet.request}</p>
      <p className={styles.summary}>
        {reviewed}/{changeSet.files.length} files reviewed · Open each file to accept or reject its
        diff.
      </p>
      <div className={styles.files}>
        {changeSet.files.slice(0, 6).map((file) => (
          <span key={file.path} className={styles.file}>
            {file.status === 'conflicted' ? '⚠ ' : ''}
            {file.path}
          </span>
        ))}
      </div>
    </section>
  );
}
