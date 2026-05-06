import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { AppState } from '../../App';
import styles from './Tooltip.module.css';

/**
 * Tooltip component to replace native title tooltips.
 * Uses a portal to avoid clipping and adds a smooth delay for premium feel.
 */
export default function Tooltip({ content, children, className = '' }) {
  const { theme } = AppState.useState();
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [placement, setPlacement] = useState('top'); // 'top' or 'bottom'
  const [arrowOffset, setArrowOffset] = useState(0);
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
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

        // Initial rough position
        const triggerCenter = rect.left + rect.width / 2 + window.scrollX;
        
        setCoords({
          top: newPlacement === 'top' ? rect.top + window.scrollY : rect.bottom + window.scrollY,
          left: triggerCenter,
        });
        setArrowOffset(0);
        setIsVisible(true);
      }
    }, 400);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  useLayoutEffect(() => {
    if (isVisible && tooltipRef.current && triggerRef.current) {
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const triggerCenter = triggerRect.left + triggerRect.width / 2 + window.scrollX;
      
      const halfWidth = tooltipRect.width / 2;
      const margin = 10;
      
      let left = triggerCenter;
      const minLeft = window.scrollX + halfWidth + margin;
      const maxLeft = window.scrollX + window.innerWidth - halfWidth - margin;
      
      // Clamp left position to keep tooltip on screen
      left = Math.max(minLeft, Math.min(maxLeft, left));
      
      setCoords(prev => ({ ...prev, left }));
      setArrowOffset(triggerCenter - left);
    }
  }, [isVisible]);

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
            ref={tooltipRef}
            className={`${styles.tooltip} ${styles[placement]} ${theme === 'light' ? styles.light : ''}`}
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
