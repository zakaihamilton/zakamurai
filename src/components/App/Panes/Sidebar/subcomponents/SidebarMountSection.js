import { Icons } from '@/components/ui/Icons';
import React from 'react';
import styles from './SidebarMountSection.module.css';

export default function SidebarMountSection({ hasFileSystem, onMountLocal }) {
  return (
    <div className={styles.mountSection}>
      <button
        type="button"
        onClick={onMountLocal}
        className={hasFileSystem ? styles.relinkButton : styles.mountButton}
      >
        <Icons.FolderPlus />
        <span>{hasFileSystem ? 'Relink Project' : 'Open Folder'}</span>
      </button>
    </div>
  );
}
