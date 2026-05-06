import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';

/**
 * Tooltip component to replace native title tooltips.
 * Uses a portal to avoid clipping and adds a smooth delay for premium feel.
 */
export default function Tooltip({ content, children, className = '' }) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [placement, setPlacement] = useState('top'); // 'top' or 'bottom'
  const [arrowOffset, setArrowOffset] = useState(0);
  const triggerRef = useRef(null);
  const timeoutRef = useRef(null);

  const showTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const topSpace = rect.top;
        const bottomSpace = window.innerHeight - rect.bottom;

        // If not enough space at the top, show at the bottom
        const newPlacement = topSpace < 40 && bottomSpace > topSpace ? 'bottom' : 'top';
        setPlacement(newPlacement);

        // Horizontal clamping
        const triggerCenter = rect.left + rect.width / 2 + window.scrollX;
        const halfWidth = 80; // Estimated half width of tooltip
        let left = triggerCenter;
        const minLeft = halfWidth + 10;
        const maxLeft = window.innerWidth - halfWidth - 10;
        left = Math.max(minLeft, Math.min(maxLeft, left));

        setCoords({
          top: newPlacement === 'top' ? rect.top + window.scrollY : rect.bottom + window.scrollY,
          left,
        });
        setArrowOffset(triggerCenter - left);
        setIsVisible(true);
      }
    }, 400);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!content) return children;

  return (
    <>
      <div
        ref={triggerRef}
        className={`${styles.container} ${className}`}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {children}
      </div>
      {isVisible &&
        createPortal(
          <div
            className={`${styles.tooltip} ${styles[placement]}`}
            role="tooltip"
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              position: 'absolute',
              '--arrow-offset': `${arrowOffset}px`,
            }}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}
