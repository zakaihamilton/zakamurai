import { createState } from '@/components/state/State';
import React, { useCallback, useEffect } from 'react';
import styles from './Resizer.module.css';

const ResizerState = createState('ResizerState');

export default function Resizer({
  onResize,
  onResizeStart,
  onResizeEnd,
  onDoubleClick,
  value,
  min = 160,
  max = 960,
  label = 'Resize pane',
}) {
  const resizerState = ResizerState.useState(null, { isResizing: false });
  const { isResizing = false } = resizerState || {};

  const startResizing = useCallback(
    (_e) => {
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
        if (e.detail < 2) {
          startResizing(e);
        }
      }}
      onTouchStart={startResizing}
      onDoubleClick={onDoubleClick}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 48 : 16;
        let nextValue;
        if (event.key === 'ArrowLeft') nextValue = Math.max(min, value - step);
        if (event.key === 'ArrowRight') nextValue = Math.min(max, value + step);
        if (event.key === 'Home') nextValue = min;
        if (event.key === 'End') nextValue = max;
        if (nextValue !== undefined) {
          event.preventDefault();
          onResize(nextValue);
        }
      }}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      data-resizer="true"
    />
  );
}
