import React, { useEffect, useMemo, useState } from 'react';
import styles from './EditorArea.module.css';

const LINE_HEIGHT = 22.4;
const VIRTUALIZE_AFTER = 2000;
const OVERSCAN = 40;

export default function Gutter({
  linesCount,
  linesArr,
  selectedLines = [],
  toggleLine,
  scrollRef,
}) {
  const totalLines = linesCount ?? linesArr?.length ?? 1;
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });
  const selectedSet = useMemo(
    () => new Set(selectedLines.map((line) => Number(line))),
    [selectedLines],
  );

  useEffect(() => {
    const element = scrollRef?.current;
    if (!element || totalLines <= VIRTUALIZE_AFTER) return undefined;

    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setViewport({
          scrollTop: element.scrollTop,
          height: element.clientHeight,
        });
      });
    };

    update();
    element.addEventListener('scroll', update, { passive: true });

    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(element);
    } else {
      window.addEventListener('resize', update);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      element.removeEventListener('scroll', update);
      if (resizeObserver) resizeObserver.disconnect();
      else window.removeEventListener('resize', update);
    };
  }, [scrollRef, totalLines]);

  const visibleLines = useMemo(() => {
    if (totalLines <= VIRTUALIZE_AFTER) {
      return Array.from({ length: totalLines }, (_, index) => ({
        line: index + 1,
        top: null,
      }));
    }

    const start = Math.max(1, Math.floor(viewport.scrollTop / LINE_HEIGHT) - OVERSCAN);
    const visibleCount = Math.ceil(viewport.height / LINE_HEIGHT) + OVERSCAN * 2;
    const end = Math.min(totalLines, start + visibleCount);
    return Array.from({ length: end - start + 1 }, (_, index) => {
      const line = start + index;
      return {
        line,
        top: (line - 1) * LINE_HEIGHT,
      };
    });
  }, [totalLines, viewport.height, viewport.scrollTop]);

  const contentStyle =
    totalLines > VIRTUALIZE_AFTER
      ? { height: `${totalLines * LINE_HEIGHT}px`, position: 'relative' }
      : undefined;

  return (
    <div className={styles.gutter}>
      <div className={styles.gutterContent} style={contentStyle}>
        {visibleLines.map(({ line, top }) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: gutter lines are clickable for selection
          <div
            key={line}
            style={top == null ? undefined : { position: 'absolute', top: `${top}px` }}
            onClick={(e) => {
              e.stopPropagation();
              if (toggleLine) toggleLine(line);
            }}
            className={`${styles.gutterLine} ${selectedSet.has(line) ? styles.selectedGutterLine : ''}`}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
