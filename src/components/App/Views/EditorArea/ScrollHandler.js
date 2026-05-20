import { useEffect, useRef } from 'react';

export default function useScrollHandler({ filePath, state, scrollContainerRef, shouldScrollRef }) {
  const lastScrollTimestampRef = useRef(null);

  useEffect(() => {
    const shouldScrollLocal =
      shouldScrollRef.current && shouldScrollRef.current.filePath === filePath;
    const shouldScrollGlobal =
      state.shouldScrollTo &&
      state.shouldScrollTo.filePath === filePath &&
      state.shouldScrollTo.timestamp !== lastScrollTimestampRef.current;

    if (shouldScrollLocal || shouldScrollGlobal) {
      let line = 1;
      if (shouldScrollLocal) {
        line = shouldScrollRef.current.line;
        shouldScrollRef.current = null;
      } else {
        line = state.shouldScrollTo.line;
        lastScrollTimestampRef.current = state.shouldScrollTo.timestamp;
      }

      const container = scrollContainerRef.current;
      if (container) {
        const timer = setTimeout(() => {
          const lineHeight = 1.6 * 14;
          const top = (line - 1) * lineHeight + 20;
          container.scrollTo({
            top: Math.max(0, top - 100),
            behavior: 'smooth',
          });
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [filePath, state.shouldScrollTo, scrollContainerRef, shouldScrollRef]);
}
