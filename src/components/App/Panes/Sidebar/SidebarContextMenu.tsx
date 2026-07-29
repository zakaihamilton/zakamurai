import ContextMenu from '@/components/ui/ContextMenu';
import { Icons } from '@/components/ui/Icons';
import { isMediaFile } from '@/utils/file';
import { getFileViews } from '@/utils/fileViews';
import React from 'react';
import type { SidebarContextMenuProps } from './sidebar-types';
import styles from './SidebarContextMenu.module.css';

type IconName = keyof typeof Icons;

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
  onOpenWith,
}: SidebarContextMenuProps) {
  const openWithViews = item.type === 'file' ? getFileViews(item.name) : [];

  return (
    <ContextMenu position={position} onClose={onClose}>
      <div className={styles.contextMenuHeader}>
        <span
          className={`${styles.headerTypeIcon} ${
            item.type === 'folder' ? styles.headerTypeIconFolder : styles.headerTypeIconFile
          }`}
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
      {item.type === 'file' && (
        <>
          <div className={styles.sectionLabel}>Open With</div>
          {openWithViews.map((view) => {
            const Icon = Icons[view.icon as IconName] || Icons.File;
            return (
              <button
                key={view.id}
                type="button"
                onClick={() => onOpenWith(view.id)}
                className={styles.contextMenuOption}
              >
                <Icon />
                {view.label}
              </button>
            );
          })}
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
