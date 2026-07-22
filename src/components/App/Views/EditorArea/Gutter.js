import Node from '@/components/state/Node';
import { createState } from '@/components/state/State';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import React, { useEffect, useMemo } from 'react';
import styles from './Gutter.module.css';

const LINE_HEIGHT = 22.4;
const VIRTUALIZE_AFTER = 2000;
const OVERSCAN = 40;
const GutterState = createState('GutterState');

export default function Gutter({
  linesCount,
  linesArr,
  lineItems,
  selectedLines = [],
  toggleLine,
  foldStarts = {},
  collapsedFoldIds = [],
  toggleFold,
  foldLabel = 'fold',
  scrollRef,
}) {
  return (
    <Node id="Gutter">
      <GutterInner
        linesCount={linesCount}
        linesArr={linesArr}
        lineItems={lineItems}
        selectedLines={selectedLines}
        toggleLine={toggleLine}
        foldStarts={foldStarts}
        collapsedFoldIds={collapsedFoldIds}
        toggleFold={toggleFold}
        foldLabel={foldLabel}
        scrollRef={scrollRef}
      />
    </Node>
  );
}

function GutterInner({
  linesCount,
  linesArr,
  lineItems,
  selectedLines = [],
  toggleLine,
  foldStarts = {},
  collapsedFoldIds = [],
  toggleFold,
  foldLabel = 'fold',
  scrollRef,
}) {
  const sourceLines = useMemo(() => {
    if (lineItems?.length) return lineItems;
    const total = linesCount ?? linesArr?.length ?? 1;
    return Array.from({ length: total }, (_, index) => ({ line: index + 1 }));
  }, [lineItems, linesArr?.length, linesCount]);
  const totalLines = sourceLines.length || 1;
  const reservedLinesCount = linesCount ?? totalLines;
  const reservedDigits = Math.max(3, String(reservedLinesCount).length);
  const gutterState = GutterState.useState(null, { viewport: { scrollTop: 0, height: 0 } });
  const { viewport = { scrollTop: 0, height: 0 } } = gutterState || {};
  const selectedSet = useMemo(
    () => new Set(selectedLines.map((line) => Number(line))),
    [selectedLines],
  );
  const collapsedSet = useMemo(() => new Set(collapsedFoldIds), [collapsedFoldIds]);

  useEffect(() => {
    const element = scrollRef?.current;
    if (!element || totalLines <= VIRTUALIZE_AFTER) return undefined;

    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        gutterState((draft) => {
          draft.viewport = {
            scrollTop: element.scrollTop,
            height: element.clientHeight,
          };
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
  }, [scrollRef, totalLines, gutterState]);

  const visibleLines = useMemo(() => {
    if (totalLines <= VIRTUALIZE_AFTER) {
      return sourceLines.map((item, index) => ({
        line: item.line,
        top: null,
        index,
      }));
    }

    const start = Math.max(0, Math.floor(viewport.scrollTop / LINE_HEIGHT) - OVERSCAN);
    const visibleCount = Math.ceil(viewport.height / LINE_HEIGHT) + OVERSCAN * 2;
    const end = Math.min(totalLines - 1, start + visibleCount);
    return Array.from({ length: end - start + 1 }, (_, index) => {
      const visibleIndex = start + index;
      return {
        line: sourceLines[visibleIndex]?.line ?? visibleIndex + 1,
        index: visibleIndex,
        top: visibleIndex * LINE_HEIGHT,
      };
    });
  }, [sourceLines, totalLines, viewport.height, viewport.scrollTop]);

  return (
    <div className={styles.gutter}>
      <div
        className={`${styles.gutterContent} ${
          totalLines > VIRTUALIZE_AFTER ? styles.gutterContentVirtualized : ''
        }`}
        style={
          totalLines > VIRTUALIZE_AFTER
            ? {
                '--gutter-digits': reservedDigits,
                '--gutter-height': `${totalLines * LINE_HEIGHT}px`,
              }
            : { '--gutter-digits': reservedDigits }
        }
      >
        {visibleLines.map(({ line, top, index }) => {
          const fold = foldStarts[line];
          const isCollapsed = fold && collapsedSet.has(fold.id);

          return (
            // biome-ignore lint/a11y/useKeyWithClickEvents: gutter lines are clickable for selection
            <div
              key={`${line}:${index}`}
              data-gutter-line={line}
              style={top == null ? undefined : { '--line-top': `${top}px` }}
              onClick={(e) => {
                e.stopPropagation();
                if (toggleLine) toggleLine(line);
              }}
              className={`${styles.gutterLine} ${
                top == null ? '' : styles.gutterLineAbsolute
              } ${selectedSet.has(line) ? styles.selectedGutterLine : ''}`}
            >
              {fold ? (
                <Tooltip content={`${isCollapsed ? 'Expand' : 'Collapse'} ${foldLabel}`}>
                  <button
                    type="button"
                    aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${foldLabel} at line ${line}`}
                    className={styles.foldToggle}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFold?.(fold.id);
                    }}
                  >
                    {isCollapsed ? <Icons.ChevronRight /> : <Icons.ChevronDown />}
                  </button>
                </Tooltip>
              ) : (
                <span className={styles.foldSpacer} />
              )}
              <span>{line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
