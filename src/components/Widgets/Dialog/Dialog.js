import React from 'react';
import { createPortal } from 'react-dom';
import styles from './Dialog.module.css';

export default function Dialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'default',
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
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h3>{title}</h3>
        </div>
        <div className={styles.content}>
          <div className={styles.message}>{message}</div>
        </div>
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
      </div>
    </div>,
    document.body,
  );
}
