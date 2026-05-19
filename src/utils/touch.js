import { useEffect, useRef } from 'react';

/**
 * A custom React hook to handle mobile tap-and-hold (long-press) gestures.
 *
 * @param {Function} onLongPress Callback triggered when the long-press threshold is met.
 * @param {Object} options Configuration options.
 * @param {number} options.delay The duration (in ms) to wait before triggering long-press (default 600ms).
 * @param {number} options.threshold The maximum movement allowed (in pixels) before cancelling long-press (default 10px).
 * @param {boolean} options.disabled If true, disables gesture handling completely.
 * @returns {Object} An object containing touch event handlers: onTouchStart, onTouchMove, onTouchEnd.
 */
export function useLongPress(onLongPress, { delay = 600, threshold = 10, disabled = false } = {}) {
  const touchTimerRef = useRef(null);
  const isLongPressRef = useRef(false);
  const touchStartPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    return () => {
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
      }
    };
  }, []);

  if (disabled) {
    return {};
  }

  const handleTouchStart = (event) => {
    const touch = event.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    isLongPressRef.current = false;

    touchTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;

      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      onLongPress(event);
    }, delay);
  };

  const handleTouchMove = (event) => {
    if (!touchTimerRef.current) return;
    const touch = event.touches[0];
    const dx = touch.clientX - touchStartPosRef.current.x;
    const dy = touch.clientY - touchStartPosRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > threshold) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const handleTouchEnd = (event) => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
    if (isLongPressRef.current) {
      event.preventDefault();
    }
  };

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}
