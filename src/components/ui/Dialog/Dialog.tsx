import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import type { DialogProps } from '@/components/ui/types';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { notifyDialogFocusRestored } from '../focusRestore';
import styles from './Dialog.module.css';

const activeDialogStack: symbol[] = [];

export default function Dialog({
  isOpen,
  title,
  message,
  children,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'default',
  footer,
  className = '',
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    if (!isOpen) return undefined;
    const dialogId = Symbol('dialog');
    activeDialogStack.push(dialogId);
    openerRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const confirmButton = dialog?.querySelector<HTMLElement>('button[data-dialog-confirm]');
    (
      dialog?.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      ) ||
      confirmButton ||
      focusable?.[0] ||
      dialog
    )?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (activeDialogStack[activeDialogStack.length - 1] === dialogId) {
          event.preventDefault();
          event.stopPropagation();
          onCancelRef.current();
        }
        return;
      }
      if (event.key !== 'Tab' || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const idx = activeDialogStack.lastIndexOf(dialogId);
      if (idx !== -1) {
        activeDialogStack.splice(idx, 1);
      }
      const opener = openerRef.current;
      if (opener?.isConnected) {
        notifyDialogFocusRestored(opener);
        opener.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.backdrop}
        onClick={onCancel}
        aria-label="Close dialog"
      />
      <dialog
        ref={dialogRef}
        className={`${styles.dialog} ${className}`}
        open
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message && !children ? messageId : undefined}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <h3 id={titleId}>{title}</h3>
          <Tooltip content="Close" shortcut="" suppressInitialFocus>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onCancel}
              aria-label="Close dialog"
            >
              <Icons.Close size={16} />
            </button>
          </Tooltip>
        </div>
        <div className={`${styles.content} ${children ? styles.customContent : ''}`}>
          {children || (
            <div id={messageId} className={styles.message}>
              {message}
            </div>
          )}
        </div>
        {footer !== undefined ? (
          footer
        ) : (
          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={onCancel}>
              {cancelText}
            </button>
            <button
              type="button"
              data-dialog-confirm
              className={`${styles.confirmBtn} ${type === 'danger' ? styles.danger : ''}`}
              onClick={onConfirm}
            >
              {confirmText}
            </button>
          </div>
        )}
      </dialog>
    </div>,
    document.body,
  );
}
