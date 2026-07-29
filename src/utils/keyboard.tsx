import { createState } from '@/components/state/State';
import type { KeyboardShortcutStateShape } from '@/components/state/domain-types';
import { useEffect } from 'react';

export const KeyboardShortcutState =
  createState<KeyboardShortcutStateShape>('KeyboardShortcutState');

const hasWindow = (): boolean => typeof window !== 'undefined';

export const isMobileLikeDevice = (): boolean => {
  if (!hasWindow()) return false;

  const hasCoarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const hasTouch = navigator.maxTouchPoints > 0;
  const hasSmallViewport = window.innerWidth <= 768;

  return hasCoarsePointer || (hasTouch && hasSmallViewport);
};

const hasKeyboardActivity = (): boolean => {
  if (!hasWindow()) return false;
  try {
    return window.sessionStorage.getItem('hasKeyboardActivity') === 'true';
  } catch {
    return false;
  }
};

export const markKeyboardActivity = (): void => {
  if (!hasWindow()) return;
  try {
    window.sessionStorage.setItem('hasKeyboardActivity', 'true');
  } catch {
    // Storage can be unavailable in private contexts; in-memory hook state still updates.
  }
};

export const shouldShowKeyboardShortcuts = (): boolean => {
  return !isMobileLikeDevice() || hasKeyboardActivity();
};

export const useShouldShowKeyboardShortcuts = (): boolean => {
  const keyboardShortcutState = KeyboardShortcutState.useState(null, {
    shouldShow: shouldShowKeyboardShortcuts(),
  });
  const { shouldShow = shouldShowKeyboardShortcuts() } = keyboardShortcutState || {};

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      markKeyboardActivity();
      keyboardShortcutState?.((draft) => {
        draft.shouldShow = true;
      });
    };

    const handleResize = () => {
      keyboardShortcutState?.((draft) => {
        draft.shouldShow = shouldShowKeyboardShortcuts();
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [keyboardShortcutState]);

  return shouldShow;
};
