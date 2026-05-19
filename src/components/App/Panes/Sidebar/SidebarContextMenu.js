import { Icons } from '@/components/Core/Base/Icons';
import ContextMenu from '@/components/Widgets/ContextMenu/ContextMenu';
import { isMediaFile } from '@/utils/file';
import React from 'react';
import styles from './SidebarContextMenu.module.css';

export default function SidebarContextMenu({
  item,
  pathStr,
  isLoading,
  isExpanded,
  position,
  onClose,
  onStartCreate,
  onStartRename,
  onStartDelete,
}) {
  return (
    <ContextMenu position={position} onClose={onClose}>
      <div className={styles.contextMenuHeader}>
        <span
          className={styles.headerTypeIcon}
          style={{ color: item.type === 'folder' ? 'var(--accent)' : 'var(--text-muted)' }}
        >
          {isLoading ? (
            <div className={styles.spinner} />
          ) : item.type === 'folder' ? (
            <Icons.Folder open={isExpanded} />
          ) : isMediaFile(item.name) ? (
            <Icons.Image />
          ) : (
            <Icons.File />
          )}
        </span>
        <div className={styles.headerTextContainer}>
          <span className={styles.headerName} title={item.name}>
            {item.name}
          </span>
          <span className={styles.headerPath} title={item.isRoot ? item.name : `/${pathStr}`}>
            {item.isRoot ? 'Root' : `/${pathStr}`}
          </span>
        </div>
      </div>
      <div className={styles.divider} />

      {item.type === 'folder' && (
        <>
          <button
            type="button"
            onClick={() => onStartCreate('file')}
            className={styles.contextMenuOption}
          >
            <Icons.FilePlus />
            New File
          </button>
          <button
            type="button"
            onClick={() => onStartCreate('folder')}
            className={styles.contextMenuOption}
          >
            <Icons.FolderPlus />
            New Folder
          </button>
          <div className={styles.divider} />
        </>
      )}
      <button type="button" onClick={onStartRename} className={styles.contextMenuOption}>
        <Icons.Edit />
        Rename
      </button>
      {!item.isRoot && (
        <button
          type="button"
          onClick={onStartDelete}
          className={`${styles.deleteOption} ${styles.contextMenuOption}`}
        >
          <Icons.Trash />
          Delete
        </button>
      )}
    </ContextMenu>
  );
}
