import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

export default function VirtualList({
  items,
  itemHeight,
  overscan = 8,
  renderItem,
  className = '',
  style,
}) {
  const containerRef = useRef(null);
  const scrollFrameRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const updateHeight = () => setHeight(element.clientHeight);
    updateHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeight);
      return () => window.removeEventListener('resize', updateHeight);
    }

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback((event) => {
    const nextScrollTop = event.currentTarget.scrollTop;
    window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      setScrollTop(nextScrollTop);
    });
  }, []);

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
