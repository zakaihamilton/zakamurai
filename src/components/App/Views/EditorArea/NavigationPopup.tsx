import Tooltip from '@/components/ui/Tooltip';
import type { CSSProperties } from 'react';
import styles from './NavigationPopup.module.css';
import type { NavigationPopupProps } from './types';

export default function NavigationPopup({ popup, onClose, onJumpToTarget }: NavigationPopupProps) {
  if (!popup.visible) return null;

  return (
    <div
      className={styles.hoverPopup}
      style={{ '--popup-left': `${popup.x}px`, '--popup-top': `${popup.y}px` } as CSSProperties}
    >
      <div className={styles.popupHeader}>
        <span>
          {popup.isImport
            ? 'Open Import'
            : popup.isExport
              ? 'Referenced in'
              : popup.isComponent
                ? 'Component Definition'
                : popup.isCss
                  ? 'Referenced in JS'
                  : 'Defined in CSS'}
        </span>
        <Tooltip content="Close">
          <button
            type="button"
            className={styles.popupCloseBtn}
            onClick={onClose}
            aria-label="Close popup"
          >
            &times;
          </button>
        </Tooltip>
      </div>
      <ul className={styles.popupList}>
        {popup.targets.map((target) => (
          <li
            key={`${target.filePath}:${target.loc.line}:${target.loc.col}:${target.loc.index || 0}`}
          >
            <button
              type="button"
              className={styles.popupItem}
              onClick={() => {
                onJumpToTarget?.(target.filePath, target.loc);
                onClose();
              }}
            >
              <span>{target.fileName}</span>
              <span className={styles.popupLineNumber}>:{target.loc.line}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
