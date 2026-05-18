import Node from '@/components/Core/Base/Node';
import { createState } from '@/components/Core/Base/State';
import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react';

const VirtualListState = createState('VirtualListState');

export default function VirtualList({
  items,
  itemHeight,
  overscan = 8,
  renderItem,
  className = '',
  style,
}) {
  return (
    <Node id="VirtualList">
      <VirtualListInner
        items={items}
        itemHeight={itemHeight}
        overscan={overscan}
        renderItem={renderItem}
        className={className}
        style={style}
      />
    </Node>
  );
}

function VirtualListInner({ items, itemHeight, overscan = 8, renderItem, className = '', style }) {
  const containerRef = useRef(null);
  const scrollFrameRef = useRef(0);
  const virtualListState = VirtualListState.useState(null, { scrollTop: 0, height: 0 });
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
    (event) => {
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

  const totalHeight = items.length * itemHeight;
  const range = useMemo(() => {
    const visibleCount = Math.ceil(height / itemHeight);
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const end = Math.min(items.length, start + visibleCount + overscan * 2 + 1);
    return { start, end };
  }, [height, itemHeight, items.length, overscan, scrollTop]);

  return (
    <div ref={containerRef} className={className} style={style} onScroll={handleScroll}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        {items.slice(range.start, range.end).map((item, offset) => {
          const index = range.start + offset;
          return (
            <div
              key={item.key || item.pathStr || index}
              style={{
                position: 'absolute',
                top: index * itemHeight,
                left: 0,
                right: 0,
                height: itemHeight,
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
