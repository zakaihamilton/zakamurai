import Node from '@/components/state/Node';
import { createState } from '@/components/state/State';
import type { VirtualListStateShape } from '@/types/domain-types';
import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { requireStore } from '../../types';
import styles from './VirtualList.module.css';
import type { VirtualListProps } from './sidebar-types';

const VirtualListState = createState<VirtualListStateShape>('VirtualListState');

export default function VirtualList<T extends { key?: string; pathStr?: string }>({
  items,
  itemHeight,
  overscan = 8,
  renderItem,
  className = '',
  style,
  scrollKey,
  scrollToIndex,
}: VirtualListProps<T>) {
  return (
    <Node id="VirtualList">
      <VirtualListInner
        items={items}
        itemHeight={itemHeight}
        overscan={overscan}
        renderItem={renderItem}
        className={className}
        style={style}
        scrollKey={scrollKey}
        scrollToIndex={scrollToIndex}
      />
    </Node>
  );
}

function VirtualListInner<T extends { key?: string; pathStr?: string }>({
  items,
  itemHeight,
  overscan = 8,
  renderItem,
  className = '',
  style,
  scrollKey,
  scrollToIndex,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef(0);
  const virtualListState = requireStore(
    VirtualListState.useState(null, { scrollTop: 0, height: 0 }),
  );
  const { scrollTop = 0, height = 0 } = virtualListState || {};

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const updateHeight = () => {
      virtualListState((draft) => {
        draft.height = element.clientHeight;
      });
    };
    updateHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeight);
      return () => window.removeEventListener('resize', updateHeight);
    }

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [virtualListState]);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const nextScrollTop = event.currentTarget.scrollTop;
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        virtualListState((draft) => {
          draft.scrollTop = nextScrollTop;
        });
      });
    },
    [virtualListState],
  );

  useLayoutEffect(
    () => () => {
      window.cancelAnimationFrame(scrollFrameRef.current);
    },
    [],
  );

  React.useEffect(() => {
    const _trigger = scrollKey;
    if (scrollToIndex !== undefined && scrollToIndex !== null && scrollToIndex >= 0) {
      const container = containerRef.current;
      if (!container) return;

      const itemTop = scrollToIndex * itemHeight;
      const itemBottom = itemTop + itemHeight;
      const currentScrollTop = container.scrollTop;
      const containerHeight = container.clientHeight || height;

      if (itemTop < currentScrollTop || itemBottom > currentScrollTop + containerHeight) {
        if (itemTop < currentScrollTop) {
          container.scrollTo({ top: itemTop, behavior: 'smooth' });
        } else {
          container.scrollTo({ top: itemBottom - containerHeight, behavior: 'smooth' });
        }
      }
    }
  }, [scrollKey, scrollToIndex, itemHeight, height]);

  const totalHeight = items.length * itemHeight;
  const range = useMemo(() => {
    const visibleCount = Math.ceil(height / itemHeight);
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const end = Math.min(items.length, start + visibleCount + overscan * 2 + 1);
    return { start, end };
  }, [height, itemHeight, items.length, overscan, scrollTop]);

  return (
    <div ref={containerRef} className={className} style={style} onScroll={handleScroll}>
      <div
        className={styles.spacer}
        style={{ ['--virtual-total-height' as string]: `${totalHeight}px` }}
      >
        {items.slice(range.start, range.end).map((item: T, offset: number) => {
          const index = range.start + offset;
          return (
            <div
              key={item.key || item.pathStr || index}
              className={styles.row}
              style={{
                ['--row-height' as string]: `${itemHeight}px`,
                ['--row-top' as string]: `${index * itemHeight}px`,
              }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
