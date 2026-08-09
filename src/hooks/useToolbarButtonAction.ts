import { useCallback, useRef, useState } from 'react';

export type UseToolbarButtonActionOptions = {
  /** Duration in milliseconds to show the completed feedback state (default: 1200ms) */
  feedbackDuration?: number;
};

export function useToolbarButtonAction<TArgs extends unknown[] = [], T = void>(
  action?: (...args: TArgs) => T | Promise<T>,
  options: UseToolbarButtonActionOptions = {},
) {
  const { feedbackDuration = 1200 } = options;
  const [isPressed, setIsPressed] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback(
    async (...args: TArgs) => {
      if (!action) return;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      setIsPressed(true);
      setIsCompleted(false);

      try {
        const result = action(...args);
        if (result instanceof Promise) {
          setIsExecuting(true);
          await result;
        }
        setIsPressed(false);
        setIsExecuting(false);
        setIsCompleted(true);

        timeoutRef.current = setTimeout(() => {
          setIsCompleted(false);
          timeoutRef.current = null;
        }, feedbackDuration);
      } catch (error) {
        setIsPressed(false);
        setIsExecuting(false);
        setIsCompleted(false);
        throw error;
      }
    },
    [action, feedbackDuration],
  );

  return {
    handleClick,
    isPressed,
    isExecuting,
    isCompleted,
  };
}
