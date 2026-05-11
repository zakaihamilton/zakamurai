import { AppState } from '@/components/App/AppState';
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';

/**
 * Tooltip component to replace native title tooltips.
 * Uses a portal to avoid clipping and adds a smooth delay for premium feel.
 */
export default function Tooltip({ content, shortcut, children, className = '' }) {
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

        // Preliminary placement, will be refined in useLayoutEffect
        const newPlacement = topSpace < 100 && bottomSpace > topSpace ? 'bottom' : 'top';
        setPlacement(newPlacement);

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
      const margin = 10;
      const arrowHeight = 10;

      // Vertical flipping logic based on actual height
      let newPlacement = placement;
      const tooltipHeight = tooltipRect.height + arrowHeight + margin;
      const spaceAbove = triggerRect.top;
      const spaceBelow = window.innerHeight - triggerRect.bottom;

      if (placement === 'top' && spaceAbove < tooltipHeight && spaceBelow > spaceAbove) {
        newPlacement = 'bottom';
      } else if (placement === 'bottom' && spaceBelow < tooltipHeight && spaceAbove > spaceBelow) {
        newPlacement = 'top';
      }

      if (newPlacement !== placement) {
        setPlacement(newPlacement);
        return;
      }

      // Horizontal positioning and clamping
      const triggerCenter = triggerRect.left + triggerRect.width / 2 + window.scrollX;
      const halfWidth = tooltipRect.width / 2;

      // Ensure we don't go off screen horizontally
      const minLeft = window.scrollX + halfWidth + margin;
      const maxLeft = window.scrollX + window.innerWidth - halfWidth - margin;

      // Handle cases where tooltip is wider than window
      let left = triggerCenter;
      if (tooltipRect.width + 2 * margin > window.innerWidth) {
        left = window.scrollX + window.innerWidth / 2;
      } else {
        left = Math.max(minLeft, Math.min(maxLeft, triggerCenter));
      }

      // Final vertical position
      let top =
        newPlacement === 'top'
          ? triggerRect.top + window.scrollY
          : triggerRect.bottom + window.scrollY;

      // Vertical clamping (ensure it doesn't go off screen at the very top/bottom)
      const viewportTop = window.scrollY + margin;
      const viewportBottom = window.scrollY + window.innerHeight - margin;

      if (newPlacement === 'top') {
        const tooltipTop = top - tooltipRect.height - arrowHeight;
        if (tooltipTop < viewportTop) {
          top += viewportTop - tooltipTop;
        }
      } else {
        const tooltipBottom = top + tooltipRect.height + arrowHeight;
        if (tooltipBottom > viewportBottom) {
          top -= tooltipBottom - viewportBottom;
        }
      }

      setCoords({ top, left });

      // Clamp arrow offset to stay within tooltip boundaries (considering border radius)
      const maxArrowOffset = Math.max(0, halfWidth - 15);
      const rawArrowOffset = triggerCenter - left;
      setArrowOffset(Math.max(-maxArrowOffset, Math.min(maxArrowOffset, rawArrowOffset)));
    }
  }, [isVisible, placement]);

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
              maxWidth: `min(280px, ${window.innerWidth - 20}px)`,
            }}
          >
            <div className={styles.inner}>
              <span className={styles.content}>{content}</span>
              {shortcut && <span className={styles.shortcut}>{shortcut}</span>}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
