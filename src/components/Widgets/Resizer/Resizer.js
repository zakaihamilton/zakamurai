import { createState } from '@/components/Core/Base/State';
import React, { useCallback, useEffect } from 'react';
import styles from './Resizer.module.css';

const ResizerState = createState('ResizerState');

export default function Resizer({ onResize, onResizeStart, onResizeEnd, onDoubleClick }) {
  const resizerState = ResizerState.useState(null, { isResizing: false });
  const { isResizing = false } = resizerState || {};

  const startResizing = useCallback(
    (e) => {
      resizerState((draft) => {
        draft.isResizing = true;
      });
      if (onResizeStart) onResizeStart();
      e.preventDefault();
    },
    [onResizeStart, resizerState],
  );

  const stopResizing = useCallback(() => {
    resizerState((draft) => {
      draft.isResizing = false;
    });
    if (onResizeEnd) onResizeEnd();
  }, [onResizeEnd, resizerState]);

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
