import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import React from 'react';
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
}) {
  if (!isOpen) return null;

  return createPortal(
    <div className={styles.wrapper}>
      <div
        className={styles.backdrop}
        onClick={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onCancel();
        }}
        role="button"
        tabIndex={-1}
        aria-label="Close dialog"
      />
      <div className={`${styles.dialog} ${className}`}>
        <div className={styles.header}>
          <h3>{title}</h3>
          <Tooltip content="Close">
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onCancel}
              aria-label="Close dialog"
            >
              ×
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
      </div>
    </div>,
    document.body,
  );
}
