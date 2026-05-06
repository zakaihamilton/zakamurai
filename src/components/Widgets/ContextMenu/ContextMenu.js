import React from 'react';
import styles from './ContextMenu.module.css';

export default function ContextMenu({ position, onClose, children }) {
  if (!position) return null;

  return (
    <>
      <div 
        className={styles.overlay} 
        onClick={onClose} 
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }} 
      />
      <div
        className={styles.contextMenu}
        style={{ top: position.y, left: position.x }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  );
}
