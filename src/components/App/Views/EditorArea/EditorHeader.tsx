import FileViewToolbar from '@/components/App/Views/FileViewToolbar';
import { Icons } from '@/components/ui/Icons';
import ToolbarButton from '@/components/ui/ToolbarButton';
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
  onCopy,
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
        <ToolbarButton
          className={`${styles.actionBtn} ${isReadOnly ? styles.actionBtnActive : ''}`}
          onClick={() => setIsReadOnly(!isReadOnly)}
          tooltip={isReadOnly ? 'Switch to Edit Mode' : 'Switch to Inspection Mode'}
          shortcut={formatShortcut('⌃E')}
          aria-label={isReadOnly ? 'Switch to edit mode' : 'Switch to inspection mode'}
          aria-pressed={isReadOnly}
        >
          {isReadOnly ? <Icons.Code size={14} /> : <Icons.Edit size={14} />}
        </ToolbarButton>
        <ToolbarButton
          className={styles.actionBtn}
          onClick={() => setShowFind(!showFind)}
          tooltip="Find/Replace"
          shortcut={formatShortcut('⌘F')}
          aria-label="Find and replace"
          aria-pressed={showFind}
        >
          <Icons.Search />
        </ToolbarButton>
        <ToolbarButton
          className={styles.actionBtn}
          onClick={handleFormat}
          tooltip="Format Code"
          shortcut={formatShortcut('⌃⇧F')}
          aria-label="Format code"
        >
          <Icons.Layout />
        </ToolbarButton>
        <ToolbarButton
          className={styles.actionBtn}
          onClick={onCopy}
          tooltip="Copy Code to Clipboard"
          aria-label="Copy code to clipboard"
        >
          <Icons.Copy />
        </ToolbarButton>
        {hasPendingDeletion && (
          <div className={styles.diffHeaderToolbar}>
            <span className={styles.diffLabel}>Review AI Deletion:</span>
            <ToolbarButton
              onClick={handleApprove}
              className={`${styles.diffButton} ${styles.approveBtn}`}
              tooltip="Approve Deletion"
              shortcut={formatShortcut('⌘S')}
            >
              <Icons.Check /> Delete
            </ToolbarButton>
            <ToolbarButton
              onClick={handleUndo}
              className={`${styles.diffButton} ${styles.undoBtn}`}
              tooltip="Keep File"
              shortcut={`${formatShortcut('⌘.')} / ${formatShortcut('⌘⌫')}`}
            >
              <Icons.Undo /> Keep
            </ToolbarButton>
          </div>
        )}
        {hasDiff && !hasPendingDeletion && (
          <div className={styles.diffHeaderToolbar}>
            <span className={styles.diffLabel}>Review AI Changes:</span>
            <ToolbarButton
              onClick={handleApprove}
              className={`${styles.diffButton} ${styles.approveBtn}`}
              tooltip="Approve Changes"
              shortcut={formatShortcut('⌘S')}
            >
              <Icons.Check /> Approve
            </ToolbarButton>
            <ToolbarButton
              onClick={handleUndo}
              className={`${styles.diffButton} ${styles.undoBtn}`}
              tooltip="Cancel Changes"
              shortcut={`${formatShortcut('⌘.')} / ${formatShortcut('⌘⌫')}`}
            >
              <Icons.Undo /> Undo
            </ToolbarButton>
            <ToolbarButton
              onClick={() => setShowSideBySide(!showSideBySide)}
              className={`${styles.diffButton} ${showSideBySide ? styles.sideBySideActive : ''}`}
              tooltip="Toggle Side by Side View"
            >
              <Icons.Columns /> Diff
            </ToolbarButton>
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
