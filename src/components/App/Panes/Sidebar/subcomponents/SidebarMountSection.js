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
        aria-label={hasFileSystem ? 'Relink local project folder' : 'Open local project folder'}
      >
        <Icons.FolderPlus />
        <span>{hasFileSystem ? 'Relink Project' : 'Open Folder'}</span>
      </button>
      <p className={styles.hint}>
        Projects save in browser storage by default. Open a local folder for larger projects (File
        System Access API).
      </p>
    </div>
  );
}
