import type { RoleGraphAddRowProps } from '@/components/App/Panes/Prompt/prompt-types';
import React from 'react';
import styles from './RoleGraphAddRow.module.css';

export default function RoleGraphAddRow({
  kindOptions = [],
  disabled = false,
  onAdd,
}: RoleGraphAddRowProps) {
  return (
    <div className={styles.addRow}>
      {kindOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.addChip}
          disabled={disabled}
          onClick={() => onAdd?.(option.value)}
        >
          + {option.label}
        </button>
      ))}
    </div>
  );
}
