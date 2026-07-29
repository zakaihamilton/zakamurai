import { Icons } from '@/components/ui/Icons';
import { formatShortcut } from '@/utils/os';
import React from 'react';
import type { SidebarFilterProps } from './sidebar-types';
import styles from './Filter.module.css';

export default function SidebarFilter({ inputRef, value, onChange }: SidebarFilterProps) {
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
