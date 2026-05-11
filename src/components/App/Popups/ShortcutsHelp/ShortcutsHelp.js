import { getShortcutsByGroup } from '@/components/App/Manager/Shortcuts';
import { Icons } from '@/components/Core/Base/Icons';
import { formatShortcut, isMac } from '@/utils/os';
import React from 'react';
import { createPortal } from 'react-dom';
import styles from './ShortcutsHelp.module.css';

const SHORTCUTS = getShortcutsByGroup();

export default function ShortcutsHelp({ isOpen, onClose }) {
  const groupRefs = React.useRef([]);
  if (!isOpen) return null;

  const mac = isMac();

  // Handle number keys to jump to sections
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      const num = Number.parseInt(e.key);
      if (num >= 1 && num <= SHORTCUTS.length) {
        groupRefs.current[num - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return createPortal(
    <div className={styles.wrapper}>
      <div
        className={styles.backdrop}
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        role="button"
        tabIndex={-1}
        aria-label="Close shortcuts"
      />
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>Keyboard Shortcuts</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            <Icons.Close />
          </button>
        </div>
        <div className={styles.content}>
          {SHORTCUTS.map((group, index) => (
            <div
              key={group.group}
              className={styles.group}
              ref={(el) => {
                groupRefs.current[index] = el;
              }}
            >
              <h3 className={styles.groupTitle}>
                <span className={styles.sectionIndex}>{index + 1}</span>
                {group.group}
              </h3>
              <div className={styles.items}>
                {group.items.map((item) => (
                  <div key={item.desc} className={styles.item}>
                    <span className={styles.desc}>{item.desc}</span>
                    <span className={styles.key}>{formatShortcut(item.key)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.footer}>
          <span>
            Press{' '}
            {mac ? (
              <>
                <kbd>1-5</kbd> to jump to sections • <kbd>⌘</kbd>
                <kbd>⇧</kbd>
                <kbd>K</kbd>
              </>
            ) : (
              <>
                <kbd>1-5</kbd> to jump to sections • <kbd>Ctrl</kbd> + <kbd>Shift</kbd> +{' '}
                <kbd>K</kbd>
              </>
            )}{' '}
            anytime to open this view
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
