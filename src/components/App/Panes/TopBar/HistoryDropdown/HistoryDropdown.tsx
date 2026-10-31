import Tooltip from '@/components/ui/Tooltip';
import type { NavigationHistoryEntry } from '@/types/domain-types';
import type { HistoryDropdownProps } from '../topbar-types';
import styles from './HistoryDropdown.module.css';

export default function HistoryDropdown({
  isOpen,
  onClose,
  history,
  onItemClick,
  onClearHistory,
}: HistoryDropdownProps) {
  if (!isOpen || !history || history.stack.length === 0) return null;

  return (
    <>
      <div
        className={styles.dropdownOverlay}
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Enter') {
            onClose();
          }
        }}
        role="button"
        tabIndex={-1}
        aria-label="Close history menu"
        data-testid="history-dropdown-overlay"
      />
      <div className={styles.historyDropdown} role="menu" data-testid="history-dropdown">
        <div className={styles.historyHeader}>
          <span>History</span>
          <button
            type="button"
            className={styles.clearHistoryBtn}
            onClick={onClearHistory}
            data-testid="clear-history-button"
          >
            Clear History
          </button>
        </div>
        <div className={styles.historyList}>
          {history.stack
            .slice()
            .reverse()
            .map((item: NavigationHistoryEntry, idx) => {
              const originalIdx = history.stack.length - 1 - idx;
              const isActive = originalIdx === history.currentIndex;
              return (
                <Tooltip
                  key={`${item.filePath}-${originalIdx}`}
                  content={item.filePath}
                  className={styles.historyItemTooltip}
                >
                  <button
                    type="button"
                    className={`${styles.historyItem} ${isActive ? styles.activeHistoryItem : ''}`}
                    onClick={() => onItemClick(originalIdx)}
                    role="menuitem"
                    data-testid={`history-item-${originalIdx}`}
                  >
                    <span className={styles.historyLabel}>{item.label}</span>
                    <span className={styles.historyLoc}>L{item.loc.line}</span>
                  </button>
                </Tooltip>
              );
            })}
        </div>
      </div>
    </>
  );
}
