import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { formatShortcut } from '@/utils/os';
import React from 'react';
import styles from '../LogArea.module.css';

export default function LogToolbar({
  filterText,
  onFilterChange,
  onClearFilter,
  copied,
  onCopyAll,
  onClearLogs,
}) {
  return (
    <div className={styles.header}>
      <div className={styles.headerActions}>
        <div className={styles.filterBox}>
          <Icons.Search />
          <input
            type="search"
            value={filterText}
            onChange={onFilterChange}
            placeholder="Filter logs"
            className={styles.filterInput}
            aria-label="Filter logs"
          />
          {filterText && (
            <Tooltip content="Clear filter">
              <button
                type="button"
                className={styles.filterClearBtn}
                onClick={onClearFilter}
                aria-label="Clear log filter"
              >
                <Icons.Close />
              </button>
            </Tooltip>
          )}
        </div>
        <Tooltip content={copied ? 'Copied!' : 'Copy all logs'}>
          <button
            type="button"
            className={`${styles.headerBtn} ${copied ? styles.copied : ''}`}
            onClick={onCopyAll}
            aria-label="Copy all logs"
          >
            {copied ? <Icons.Check /> : <Icons.Copy />}
          </button>
        </Tooltip>
        <Tooltip content="Clear logs" shortcut={formatShortcut('⌃K')}>
          <button
            type="button"
            onClick={onClearLogs}
            className={styles.headerBtn}
            aria-label="Clear logs"
          >
            <Icons.Trash />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
