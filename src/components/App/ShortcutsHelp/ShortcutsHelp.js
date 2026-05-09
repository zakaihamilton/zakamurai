import { Icons } from '@/components/Core/Base/Icons';
import React from 'react';
import { createPortal } from 'react-dom';
import styles from './ShortcutsHelp.module.css';

const SHORTCUTS = [
  {
    group: 'Navigation',
    items: [
      { key: '⌘B', desc: 'Toggle Sidebar' },
      { key: '⌘J', desc: 'Toggle AI Prompt' },
      { key: '⌘U', desc: 'Show Logs' },
      { key: '⌘I', desc: 'Show Preview' },
      { key: '⌘F', desc: 'Search Files' },
    ],
  },
  {
    group: 'Editor & AI',
    items: [
      { key: '⌘S', desc: 'Approve & Save Changes' },
      { key: '⌘. / ⌘⌫', desc: 'Cancel AI Changes' },
      { key: '⌘↵', desc: 'Compile Project' },
      { key: '⌘K', desc: 'Clear Logs (in Log Area)' },
      { key: '⌘⇧T', desc: 'Toggle Theme' },
    ],
  },
  {
    group: 'Tabs',
    items: [
      { key: '⌃W', desc: 'Close Current Tab' },
      { key: '⌃⇧W', desc: 'Close All Tabs' },
    ],
  },
  {
    group: 'AI Prompt',
    items: [
      { key: '↵', desc: 'Execute Prompt' },
      { key: '⌘↵', desc: 'Insert Newline' },
      { key: '⌘.', desc: 'Stop AI Generation' },
    ],
  },
  {
    group: 'General',
    items: [
      { key: '⌘⇧/', desc: 'Show Keyboard Shortcuts' },
      { key: 'Esc', desc: 'Close Modal / Cancel' },
    ],
  },
];

export default function ShortcutsHelp({ isOpen, onClose }) {
  if (!isOpen) return null;

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
                    <span className={styles.key}>{item.key}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.footer}>
          <span>
            Press <kbd>⌘</kbd>
            <kbd>⇧</kbd>
            <kbd>/</kbd> anytime to open this view
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
