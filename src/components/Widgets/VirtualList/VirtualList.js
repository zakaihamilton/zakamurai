import React, { useEffect, useRef, useState } from 'react';

export default function VirtualList({
  items,
  renderItem,
  itemHeight = 34,
  overscan = 5,
  className = '',
  style = {},
}) {
  const scrollRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const handleScroll = (e) => {
      setScrollTop(e.target.scrollTop);
    };
    const node = scrollRef.current;
    if (node) {
      node.addEventListener('scroll', handleScroll);
      return () => node.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const totalHeight = items.length * itemHeight;

  // Wait until we have a ref to determine container height, default to something reasonable if not.
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    if (scrollRef.current && typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerHeight(entry.contentRect.height);
        }
      });
      resizeObserver.observe(scrollRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan,
  );

  const visibleItems = items.slice(startIndex, endIndex);

  return (
    <div
      ref={scrollRef}
      className={className}
      style={{ overflowY: 'auto', height: '100%', position: 'relative', ...style }}
    >
      <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
        {visibleItems.map((item, index) => {
          const absoluteIndex = startIndex + index;
          return (
            <div
              key={item.id || absoluteIndex}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${itemHeight}px`,
                transform: `translateY(${absoluteIndex * itemHeight}px)`,
              }}
            >
              {renderItem(item, absoluteIndex)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
