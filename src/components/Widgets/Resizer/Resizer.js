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
        const clientX = e.clientX || e.touches?.[0].clientX;
        if (clientX !== undefined) {
          onResize(clientX);
        }
      }
    },
    [isResizing, onResize],
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      window.addEventListener('touchmove', resize, { passive: false });
      window.addEventListener('touchend', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('touchmove', resize);
      window.removeEventListener('touchend', stopResizing);
    }

    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('touchmove', resize);
      window.removeEventListener('touchend', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  return (
    <div
      className={`${styles.resizer} ${isResizing ? styles.resizing : ''}`}
      onMouseDown={(e) => {
        if (e.detail === 2 && onDoubleClick) {
          onDoubleClick(e);
        } else {
          startResizing(e);
        }
      }}
      onTouchStart={startResizing}
      data-resizer="true"
    />
  );
}
