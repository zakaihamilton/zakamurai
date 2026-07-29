import { useEffect, useRef } from 'react';

type LongPressOptions = {
  delay?: number;
  threshold?: number;
  disabled?: boolean;
};

type TouchHandlers = {
  onTouchStart?: (event: React.TouchEvent) => void;
  onTouchMove?: (event: React.TouchEvent) => void;
  onTouchEnd?: (event: React.TouchEvent) => void;
};

/**
 * A custom React hook to handle mobile tap-and-hold (long-press) gestures.
 */
export function useLongPress(
  onLongPress: (event: React.TouchEvent) => void,
  { delay = 600, threshold = 10, disabled = false }: LongPressOptions = {},
): TouchHandlers {
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const handleTouchStart = (event: React.TouchEvent) => {
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

  const handleTouchMove = (event: React.TouchEvent) => {
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

  const handleTouchEnd = (event: React.TouchEvent) => {
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
