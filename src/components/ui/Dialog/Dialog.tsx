import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import type { DialogProps } from '@/components/ui/types';
import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './Dialog.module.css';

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
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return undefined;
    openerRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (
      dialog?.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      ) ||
      focusable?.[0] ||
      dialog
    )?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
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
      openerRef.current?.focus?.();
    };
  }, [isOpen, onCancel]);

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
          {children || <div className={styles.message}>{message}</div>}
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
