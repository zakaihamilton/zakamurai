import FileViewToolbar from '@/components/App/Views/FileViewToolbar';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { FILE_VIEW_TYPES } from '@/utils/fileViews';
import { formatShortcut } from '@/utils/os';
import styles from './EditorHeader.module.css';
import type { EditorHeaderProps } from './types';

export default function EditorHeader({
  filePath,
  showFind,
  setShowFind,
  hasDiff,
  hasPendingDeletion = false,
  handleApprove,
  handleUndo,
  showSideBySide,
  setShowSideBySide,
  handleFormat,
  isReadOnly,
  setIsReadOnly,
  fileName,
  viewType = FILE_VIEW_TYPES.EDITOR,
  onSelectView,
}: EditorHeaderProps) {
  return (
    <div className={styles.editorHeader}>
      <div className={styles.headerTitle}>
        <Icons.File />
        <span className={styles.filePath}>{filePath}</span>
      </div>
      <div className={styles.headerActions}>
        <Tooltip
          content={isReadOnly ? 'Switch to Edit Mode' : 'Switch to Inspection Mode'}
          shortcut={formatShortcut('⌃E')}
        >
          <button
            type="button"
            className={`${styles.actionBtn} ${isReadOnly ? styles.actionBtnActive : ''}`}
            onClick={() => setIsReadOnly(!isReadOnly)}
            aria-label={isReadOnly ? 'Switch to edit mode' : 'Switch to inspection mode'}
            aria-pressed={isReadOnly}
          >
            {isReadOnly ? <Icons.Code size={14} /> : <Icons.Edit size={14} />}
          </button>
        </Tooltip>
        <Tooltip content="Find/Replace" shortcut={formatShortcut('⌘F')}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => setShowFind(!showFind)}
            aria-label="Find and replace"
            aria-pressed={showFind}
          >
            <Icons.Search />
          </button>
        </Tooltip>
        <Tooltip content="Format Code" shortcut={formatShortcut('⌃⇧F')}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleFormat}
            aria-label="Format code"
          >
            <Icons.Layout />
          </button>
        </Tooltip>
        {hasPendingDeletion && (
          <div className={styles.diffHeaderToolbar}>
            <span className={styles.diffLabel}>Review AI Deletion:</span>
            <Tooltip content="Approve Deletion" shortcut={formatShortcut('⌘S')}>
              <button
                type="button"
                onClick={handleApprove}
                className={`${styles.diffButton} ${styles.approveBtn}`}
              >
                <Icons.Check /> Delete
              </button>
            </Tooltip>
            <Tooltip
              content="Keep File"
              shortcut={`${formatShortcut('⌘.')} / ${formatShortcut('⌘⌫')}`}
            >
              <button
                type="button"
                onClick={handleUndo}
                className={`${styles.diffButton} ${styles.undoBtn}`}
              >
                <Icons.Undo /> Keep
              </button>
            </Tooltip>
          </div>
        )}
        {hasDiff && !hasPendingDeletion && (
          <div className={styles.diffHeaderToolbar}>
            <span className={styles.diffLabel}>Review AI Changes:</span>
            <Tooltip content="Approve Changes" shortcut={formatShortcut('⌘S')}>
              <button
                type="button"
                onClick={handleApprove}
                className={`${styles.diffButton} ${styles.approveBtn}`}
              >
                <Icons.Check /> Approve
              </button>
            </Tooltip>
            <Tooltip
              content="Cancel Changes"
              shortcut={`${formatShortcut('⌘.')} / ${formatShortcut('⌘⌫')}`}
            >
              <button
                type="button"
                onClick={handleUndo}
                className={`${styles.diffButton} ${styles.undoBtn}`}
              >
                <Icons.Undo /> Undo
              </button>
            </Tooltip>
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
        <FileViewToolbar
          fileName={fileName || filePath}
          activeViewType={viewType}
          onSelectView={onSelectView}
        />
      </div>
    </div>
  );
}
