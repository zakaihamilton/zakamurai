import React, { useEffect, useState, useCallback } from 'react';
import styles from './Resizer.module.css';

export default function Resizer({ onResize, onResizeStart, onResizeEnd, onDoubleClick }) {
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback(
    (e) => {
      setIsResizing(true);
      if (onResizeStart) onResizeStart();
      e.preventDefault();
    },
    [onResizeStart],
  );

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    if (onResizeEnd) onResizeEnd();
  }, [onResizeEnd]);

  const resize = useCallback(
    (e) => {
      if (isResizing) {
        onResize(e.clientX);
      }
    },
    [isResizing, onResize],
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }

    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  return (
    <div
      className={`${styles.resizer} ${isResizing ? styles.resizing : ''}`}
      onMouseDown={startResizing}
      onDoubleClick={onDoubleClick}
    />
  );
}
