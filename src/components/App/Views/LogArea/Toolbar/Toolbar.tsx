import { Icons } from '@/components/ui/Icons';
import ToolbarButton from '@/components/ui/ToolbarButton';
import { formatShortcut } from '@/utils/os';
import type { LogToolbarProps } from '../log-area-types';
import styles from './Toolbar.module.css';

export default function LogToolbar({
  filterText,
  onFilterChange,
  onClearFilter,
  copied,
  onCopyAll,
  onClearLogs,
}: LogToolbarProps) {
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
            <ToolbarButton
              className={styles.filterClearBtn}
              onClick={onClearFilter}
              tooltip="Clear filter"
              aria-label="Clear log filter"
            >
              <Icons.Close />
            </ToolbarButton>
          )}
        </div>
        <ToolbarButton
          className={`${styles.headerBtn} ${copied ? styles.copied : ''}`}
          onClick={onCopyAll}
          tooltip={copied ? 'Copied!' : 'Copy all logs'}
          aria-label="Copy all logs"
        >
          {copied ? <Icons.Check /> : <Icons.Copy />}
        </ToolbarButton>
        <ToolbarButton
          className={styles.headerBtn}
          onClick={onClearLogs}
          tooltip="Clear logs"
          shortcut={formatShortcut('⌃K')}
          aria-label="Clear logs"
        >
          <Icons.Trash />
        </ToolbarButton>
      </div>
    </div>
  );
}
