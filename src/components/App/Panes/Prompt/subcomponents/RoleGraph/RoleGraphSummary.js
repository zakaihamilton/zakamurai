import { describeRoleGraph } from '@/components/AI/Agent/Roles';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import React from 'react';
import styles from './RoleGraphEditor.module.css';

export default function RoleGraphSummary({ roleGraph, disabled = false, onEdit }) {
  const summary = describeRoleGraph(roleGraph);

  return (
    <div className={styles.summary} aria-label="Team role graph summary">
      <button
        type="button"
        className={styles.summaryBody}
        disabled={disabled}
        onClick={onEdit}
        aria-label="Edit role graph"
      >
        <span className={styles.summaryLabel}>Role graph</span>
        <span className={styles.summaryText}>{summary}</span>
      </button>
      <Tooltip content="Edit role graph">
        <button
          type="button"
          className={`${styles.iconBtn} ${styles.summaryEdit}`}
          disabled={disabled}
          onClick={onEdit}
          aria-label="Open role graph editor"
        >
          <Icons.Edit />
        </button>
      </Tooltip>
    </div>
  );
}
