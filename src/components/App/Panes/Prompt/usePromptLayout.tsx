import { useCallback, useEffect } from 'react';

/** Drives the desktop drawer transition without introducing local shared state. */
export default function usePromptLayout({
  isMobile,
  isOpen,
  promptWidth,
  animatedWidth,
  promptUiState,
}) {
  const setAnimatedWidth = useCallback(
    (nextValue) => {
      promptUiState((draft) => {
        draft.animatedWidth =
          typeof nextValue === 'function' ? nextValue(draft.animatedWidth) : nextValue;
      });
    },
    [promptUiState],
  );

  useEffect(() => {
    if (isMobile) return undefined;
    if (isOpen) {
      const frame = window.requestAnimationFrame(() => setAnimatedWidth(promptWidth));
      return () => window.cancelAnimationFrame(frame);
    }
    setAnimatedWidth(promptWidth);
    const frame = window.requestAnimationFrame(() => setAnimatedWidth(0));
    return () => window.cancelAnimationFrame(frame);
  }, [isMobile, isOpen, promptWidth, setAnimatedWidth]);

  return { desktopWidth: `${animatedWidth}px` };
}
