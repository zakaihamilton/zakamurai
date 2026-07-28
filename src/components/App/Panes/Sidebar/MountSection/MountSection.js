import { Icons } from '@/components/ui/Icons';
import React from 'react';
import styles from './MountSection.module.css';

export default function SidebarMountSection({ hasFileSystem, onMountLocal }) {
  return (
    <div className={styles.mountSection}>
      <button
        type="button"
        onClick={onMountLocal}
        className={hasFileSystem ? styles.relinkButton : styles.mountButton}
        aria-label={hasFileSystem ? 'Relink local project folder' : 'Open local project folder'}
      >
        <Icons.FolderPlus />
        <span>{hasFileSystem ? 'Relink Project' : 'Open Folder'}</span>
      </button>
    </div>
  );
}
