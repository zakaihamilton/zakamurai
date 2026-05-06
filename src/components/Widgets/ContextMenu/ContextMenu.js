import React from 'react';
import styles from './ContextMenu.module.css';

export default function ContextMenu({ position, onClose, children }) {
  if (!position) return null;

  return (
    <>
      <div
        role="presentation"
        className={styles.overlay}
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Enter') onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        role="menu"
        tabIndex={-1}
        className={styles.contextMenu}
        style={{ top: position.y, left: position.x }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  );
}
