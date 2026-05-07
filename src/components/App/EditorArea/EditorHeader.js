import React from 'react';
import Tooltip from '../../Widgets/Tooltip/Tooltip';
import { Icons } from '../Icons';
import styles from './EditorArea.module.css';

export default function EditorHeader({
  filePath,
  showFind,
  setShowFind,
  hasDiff,
  handleApprove,
  handleUndo,
  showSideBySide,
  setShowSideBySide,
}) {
  return (
    <div className={styles.editorHeader}>
      <div className={styles.headerTitle}>
        <Icons.File />
        <span className={styles.filePath}>{filePath}</span>
      </div>
      <div className={styles.headerActions}>
        <Tooltip content="Find/Replace (Ctrl+F)">
          <button type="button" className={styles.actionBtn} onClick={() => setShowFind(!showFind)}>
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
            <Tooltip content="Toggle Side by Side View">
              <button
                type="button"
                onClick={() => setShowSideBySide(!showSideBySide)}
                className={`${styles.diffButton} ${showSideBySide ? styles.sideBySideActive : ''}`}
              >
                <Icons.Columns /> Diff
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}
