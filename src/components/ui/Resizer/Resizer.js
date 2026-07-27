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
  className = '',
  disabled = false,
  isCollapsed = false,
}) {
  const isHiddenClass = Boolean(
    className &&
      (className.includes('hidden') ||
        className.includes('collapsed') ||
        className.includes('disabled')),
  );
  const isDisabled = disabled || isCollapsed || isHiddenClass;
  const resizerState = ResizerState.useState(null, { isResizing: false });
  const { isResizing = false } = resizerState || {};

  const startResizing = useCallback(
    (_e) => {
      if (isDisabled) return;
      resizerState((draft) => {
        draft.isResizing = true;
      });
      if (onResizeStart) onResizeStart();
    },
    [isDisabled, onResizeStart, resizerState],
  );

  const stopResizing = useCallback(() => {
    resizerState((draft) => {
      draft.isResizing = false;
    });
    if (onResizeEnd) onResizeEnd();
  }, [onResizeEnd, resizerState]);

  const resize = useCallback(
    (e) => {
      if (isResizing && !isDisabled) {
        const clientX = e.clientX || e.touches?.[0].clientX;
        if (clientX !== undefined) {
          onResize(clientX);
        }
      }
    },
    [isDisabled, isResizing, onResize],
  );

  useEffect(() => {
    if (isResizing && !isDisabled) {
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
  }, [isDisabled, isResizing, resize, stopResizing]);

  const combinedClassName = [
    styles.resizer,
    isResizing && !isDisabled ? styles.resizing : '',
    isDisabled ? styles.collapsed : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={combinedClassName}
      onMouseDown={(e) => {
        if (!isDisabled && e.detail < 2) {
          startResizing(e);
        }
      }}
      onTouchStart={isDisabled ? undefined : startResizing}
      onDoubleClick={isDisabled ? undefined : onDoubleClick}
      onKeyDown={(event) => {
        if (isDisabled) return;
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
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled ? true : undefined}
      data-resizer="true"
    />
  );
}
