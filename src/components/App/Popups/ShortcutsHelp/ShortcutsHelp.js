import { Icons } from '@/components/Core/Base/Icons';
import { formatShortcut, isMac } from '@/utils/os';
import React from 'react';
import { createPortal } from 'react-dom';
import styles from './ShortcutsHelp.module.css';
import { getShortcutsByGroup } from '@/components/App/Manager/Shortcuts';

const SHORTCUTS = getShortcutsByGroup();

export default function ShortcutsHelp({ isOpen, onClose }) {
  if (!isOpen) return null;

  const mac = isMac();

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
          {SHORTCUTS.map((group) => (
            <div key={group.group} className={styles.group}>
              <h3 className={styles.groupTitle}>{group.group}</h3>
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
                <kbd>⌘</kbd>
                <kbd>⇧</kbd>
                <kbd>K</kbd>
              </>
            ) : (
              <>
                <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>K</kbd>
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
