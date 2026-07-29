import { SHORTCUT_HIGHLIGHT_EVENT, getShortcutsByGroup } from '@/components/App/keyboard/Shortcuts';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { useShouldShowKeyboardShortcuts } from '@/utils/keyboard';
import { formatShortcut, isMac } from '@/utils/os';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ShortcutsHelpProps } from '../popup-types';
import styles from './ShortcutsHelp.module.css';

const SHORTCUTS = getShortcutsByGroup();

export default function ShortcutsHelp({ isOpen, onClose }: ShortcutsHelpProps) {
  const showShortcuts = useShouldShowKeyboardShortcuts();
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [highlightedShortcutId, setHighlightedShortcutId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !showShortcuts) return undefined;

    const handleShortcutHighlight = (event: Event) => {
      const shortcutId = (event as CustomEvent<{ shortcutId?: string }>).detail?.shortcutId;
      if (!shortcutId) return;

      setHighlightedShortcutId(shortcutId);
      window.requestAnimationFrame(() => {
        itemRefs.current[shortcutId]?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        });
      });
    };

    window.addEventListener(SHORTCUT_HIGHLIGHT_EVENT, handleShortcutHighlight);
    return () => window.removeEventListener(SHORTCUT_HIGHLIGHT_EVENT, handleShortcutHighlight);
  }, [isOpen, showShortcuts]);

  useEffect(() => {
    if (!isOpen) setHighlightedShortcutId(null);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && showShortcuts) closeButtonRef.current?.focus();
  }, [isOpen, showShortcuts]);

  if (!isOpen || !showShortcuts) return null;

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
      <dialog
        open
        className={styles.modal}
        aria-modal="true"
        aria-labelledby="shortcuts-help-title"
      >
        <div className={styles.header}>
          <h2 id="shortcuts-help-title">Keyboard Shortcuts</h2>
          <Tooltip content="Close">
            <button
              type="button"
              ref={closeButtonRef}
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Close shortcuts"
            >
              <Icons.Close />
            </button>
          </Tooltip>
        </div>
        <div className={styles.content}>
          {SHORTCUTS.map((group) => (
            <div key={group.group} className={styles.group}>
              <h3 className={styles.groupTitle}>{group.group}</h3>
              <div className={styles.items}>
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    ref={(element) => {
                      if (element) {
                        itemRefs.current[item.id] = element;
                      } else {
                        delete itemRefs.current[item.id];
                      }
                    }}
                    className={`${styles.item} ${
                      highlightedShortcutId === item.id ? styles.highlightedItem : ''
                    }`}
                  >
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
                <kbd>⌃</kbd>
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
      </dialog>
    </div>,
    document.body,
  );
}
