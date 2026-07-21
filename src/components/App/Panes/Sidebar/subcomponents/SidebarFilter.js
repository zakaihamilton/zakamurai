import { Icons } from '@/components/ui/Icons';
import { formatShortcut } from '@/utils/os';
import React from 'react';
import styles from './SidebarFilter.module.css';

export default function SidebarFilter({ inputRef, value, onChange }) {
  return (
    <div className={styles.filterSection}>
      <div className={styles.searchContainer}>
        <div className={styles.searchIcon}>
          <Icons.Search />
        </div>
        <input
          ref={inputRef}
          value={value}
          onChange={onChange}
          aria-label="Search files"
          placeholder={`Search files (${formatShortcut('⌃P')})`}
          className={styles.searchInput}
        />
      </div>
    </div>
  );
}
