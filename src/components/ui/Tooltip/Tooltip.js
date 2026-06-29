import { AppState } from '@/components/App/AppState';
import Node from '@/components/state/Node';
import { createState } from '@/components/state/State';
import { useShouldShowKeyboardShortcuts } from '@/utils/keyboard';
import React, { useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';

const TooltipState = createState('TooltipState');

/**
 * Tooltip component to replace native title tooltips.
 * Uses a portal to avoid clipping and adds a smooth delay for premium feel.
 */
export default function Tooltip({ content, shortcut, children, className = '' }) {
  return (
    <Node id="Tooltip">
      <TooltipInner content={content} shortcut={shortcut} className={className}>
        {children}
      </TooltipInner>
    </Node>
  );
}

function TooltipInner({ content, shortcut, children, className = '' }) {
  const { theme } = AppState.useState();
  const showShortcut = useShouldShowKeyboardShortcuts();
  const tooltipState = TooltipState.useState(null, {
    isVisible: false,
    coords: { top: 0, left: 0 },
    placement: 'top',
    arrowOffset: 0,
  });
  const {
    isVisible = false,
    coords = { top: 0, left: 0 },
    placement = 'top',
    arrowOffset = 0,
  } = tooltipState || {};
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const timeoutRef = useRef(null);
  const viewportMargin = 10;
  const arrowHeight = 10;

  const showTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const topSpace = rect.top;
        const bottomSpace = window.innerHeight - rect.bottom;

        // Preliminary placement, will be refined in useLayoutEffect
        const newPlacement = topSpace < 100 && bottomSpace > topSpace ? 'bottom' : 'top';

        const triggerCenter = rect.left + rect.width / 2 + window.scrollX;

        tooltipState((draft) => {
          draft.placement = newPlacement;
          draft.coords = {
            top: newPlacement === 'top' ? rect.top + window.scrollY : rect.bottom + window.scrollY,
            left: triggerCenter,
          };
          draft.arrowOffset = 0;
          draft.isVisible = true;
        });
      }
    }, 400);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    tooltipState((draft) => {
      draft.isVisible = false;
    });
  };

  useLayoutEffect(() => {
    if (isVisible && tooltipRef.current && triggerRef.current) {
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const margin = viewportMargin;

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
        tooltipState((draft) => {
          draft.placement = newPlacement;
        });
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
      const minTopAnchor = viewportTop + tooltipRect.height + arrowHeight;
      const maxBottomAnchor = viewportBottom - tooltipRect.height - arrowHeight;

      if (newPlacement === 'top') {
        top = Math.max(top, minTopAnchor);
      } else {
        top = Math.min(top, maxBottomAnchor);
      }

      // Clamp arrow offset to stay within tooltip boundaries (considering border radius)
      const maxArrowOffset = Math.max(0, halfWidth - 15);
      const rawArrowOffset = triggerCenter - left;
      tooltipState((draft) => {
        draft.coords = { top, left };
        draft.arrowOffset = Math.max(-maxArrowOffset, Math.min(maxArrowOffset, rawArrowOffset));
      });
    }
  }, [isVisible, placement, tooltipState]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!content) return children;

  const contentLines =
    typeof content === 'string' ? content.split('\n') : React.Children.toArray(content);
  const hasContentHeader =
    typeof content === 'string' && contentLines.length > 1 && contentLines[0]?.trim();

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
              '--tooltip-top': `${coords.top}px`,
              '--tooltip-left': `${coords.left}px`,
              '--arrow-offset': `${arrowOffset}px`,
              '--tooltip-max-width': `${Math.max(0, window.innerWidth - viewportMargin * 2)}px`,
              '--tooltip-max-height': `${Math.max(0, window.innerHeight - viewportMargin * 2 - arrowHeight)}px`,
            }}
          >
            <div className={styles.inner}>
              {hasContentHeader ? (
                <span className={styles.content}>
                  <span className={styles.contentHeader}>{contentLines[0]}</span>
                  <span className={styles.contentBody}>{contentLines.slice(1).join('\n')}</span>
                </span>
              ) : (
                <span className={styles.content}>{content}</span>
              )}
              {shortcut && showShortcut && <span className={styles.shortcut}>{shortcut}</span>}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
