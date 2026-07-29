import { useLayoutEffect } from 'react';
import type { ScrollContainerRef, TextareaRef } from './types';

export default function useScrollSync(
  scrollContainerRef: ScrollContainerRef | undefined,
  textareaRef: TextareaRef,
  localContent: string,
): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-attach scroll sync when content width changes
  useLayoutEffect(() => {
    const container = scrollContainerRef?.current;
    const textarea = textareaRef?.current;
    if (!container || !textarea) return;

    let isSyncingContainer = false;
    let isSyncingTextarea = false;

    const handleContainerScroll = () => {
      if (isSyncingTextarea) {
        isSyncingTextarea = false;
        return;
      }
      isSyncingContainer = true;
      textarea.scrollLeft = container.scrollLeft;
    };

    const handleTextareaScroll = () => {
      if (isSyncingContainer) {
        isSyncingContainer = false;
        return;
      }
      isSyncingTextarea = true;
      container.scrollLeft = textarea.scrollLeft;
    };

    container.addEventListener('scroll', handleContainerScroll, { passive: true });
    textarea.addEventListener('scroll', handleTextareaScroll, { passive: true });

    textarea.scrollLeft = container.scrollLeft;

    return () => {
      container.removeEventListener('scroll', handleContainerScroll);
      textarea.removeEventListener('scroll', handleTextareaScroll);
    };
  }, [scrollContainerRef, textareaRef, localContent]);
}
