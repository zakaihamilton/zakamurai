import React from 'react';
import { Icons } from '../Icons';
import Tooltip from '../../Widgets/Tooltip/Tooltip';
import styles from './EditorArea.module.css';

export default function EditorHeader({
  filePath,
  showFind,
  setShowFind,
  hasDiff,
  handleApprove,
  handleUndo,
}) {
  return (
    <div className={styles.editorHeader}>
      <div className={styles.headerTitle}>
        <Icons.File />
        <span className={styles.filePath}>{filePath}</span>
      </div>
      <div className={styles.headerActions}>
        <Tooltip content="Find/Replace (Ctrl+F)">
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => setShowFind(!showFind)}
          >
            <Icons.Search />
          </button>
        </Tooltip>
        {hasDiff && (
          <div className={styles.diffHeaderToolbar}>
            <span className={styles.diffLabel}>Review AI Changes:</span>
            <button
              type="button"
              onClick={handleApprove}
              className={`${styles.diffButton} ${styles.approveBtn}`}
            >
              <Icons.Check /> Approve
            </button>
            <button
              type="button"
              onClick={handleUndo}
              className={`${styles.diffButton} ${styles.undoBtn}`}
            >
              <Icons.Undo /> Undo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
