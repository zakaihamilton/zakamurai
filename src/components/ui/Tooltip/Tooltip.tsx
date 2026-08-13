import { AppState } from '@/components/App/AppState';
import { DIALOG_FOCUS_RESTORED_EVENT } from '@/components/ui/focusRestore';
import type { TooltipProps } from '@/components/ui/types';
import type { TooltipStateShape } from '@/types/domain-types';
import { useShouldShowKeyboardShortcuts } from '@/utils/keyboard';
import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Node, createState } from 'triactor';
import styles from './Tooltip.module.css';

const TooltipState = createState<TooltipStateShape>('TooltipState');

let activeTooltipHide: (() => void) | null = null;

function registerActiveTooltip(hideFn: () => void) {
  if (activeTooltipHide && activeTooltipHide !== hideFn) {
    activeTooltipHide();
  }
  activeTooltipHide = hideFn;
}

function unregisterActiveTooltip(hideFn: () => void) {
  if (activeTooltipHide === hideFn) {
    activeTooltipHide = null;
  }
}

/**
 * Tooltip component to replace native title tooltips.
 * Uses a portal to avoid clipping and adds a smooth delay for premium feel.
 */
export default function Tooltip({
  content,
  shortcut = '',
  children,
  className = '',
  suppressInitialFocus = false,
}: TooltipProps) {
  return (
    <Node id="Tooltip">
      <TooltipInner
        content={content}
        shortcut={shortcut}
        className={className}
        suppressInitialFocus={suppressInitialFocus}
      >
        {children}
      </TooltipInner>
    </Node>
  );
}

function TooltipInner({
  content,
  shortcut = '',
  children,
  className = '',
  suppressInitialFocus = false,
}: TooltipProps) {
  const appState = AppState.useState();
  const theme = appState?.theme ?? 'dark';
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
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTriggerActiveRef = useRef(false);
  const shouldSuppressFocusRef = useRef(suppressInitialFocus);
  const viewportMargin = 10;
  const arrowHeight = 10;

  const hideTooltip = useCallback(() => {
    isTriggerActiveRef.current = false;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    unregisterActiveTooltip(hideTooltip);
    tooltipState?.((draft) => {
      draft.isVisible = false;
    });
  }, [tooltipState]);

  const showTooltip = useCallback(() => {
    isTriggerActiveRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      if (isTriggerActiveRef.current && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const topSpace = rect.top;
        const bottomSpace = window.innerHeight - rect.bottom;

        // Preliminary placement, will be refined in useLayoutEffect
        const newPlacement = topSpace < 100 && bottomSpace > topSpace ? 'bottom' : 'top';

        const triggerCenter = rect.left + rect.width / 2;

        registerActiveTooltip(hideTooltip);

        tooltipState?.((draft) => {
          draft.placement = newPlacement;
          draft.coords = {
            top: newPlacement === 'top' ? rect.top : rect.bottom,
            left: triggerCenter,
          };
          draft.arrowOffset = 0;
          draft.isVisible = true;
        });
      }
    }, 400);
  }, [hideTooltip, tooltipState]);

  const showTooltipOnFocus = useCallback(() => {
    if (shouldSuppressFocusRef.current) {
      shouldSuppressFocusRef.current = false;
      return;
    }
    showTooltip();
  }, [showTooltip]);

  const showTooltipOnTouch = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'touch') showTooltip();
    },
    [showTooltip],
  );

  const hideTooltipOnTouch = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'touch') hideTooltip();
    },
    [hideTooltip],
  );

  const showTooltipOnTouchStart = useCallback(() => showTooltip(), [showTooltip]);
  const hideTooltipOnTouchEnd = useCallback(() => hideTooltip(), [hideTooltip]);

  useLayoutEffect(() => {
    const updatePosition = () => {
      if (tooltipRef.current && triggerRef.current) {
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
        } else if (
          placement === 'bottom' &&
          spaceBelow < tooltipHeight &&
          spaceAbove > spaceBelow
        ) {
          newPlacement = 'top';
        }

        if (newPlacement !== placement) {
          tooltipState?.((draft) => {
            draft.placement = newPlacement;
          });
          return;
        }

        // Horizontal positioning and clamping
        const triggerCenter = triggerRect.left + triggerRect.width / 2;
        const halfWidth = tooltipRect.width / 2;

        // Ensure we don't go off screen horizontally
        const minLeft = halfWidth + margin;
        const maxLeft = window.innerWidth - halfWidth - margin;

        // Handle cases where tooltip is wider than window
        let left = triggerCenter;
        if (tooltipRect.width + 2 * margin > window.innerWidth) {
          left = window.innerWidth / 2;
        } else {
          left = Math.max(minLeft, Math.min(maxLeft, triggerCenter));
        }

        // Final vertical position
        let top = newPlacement === 'top' ? triggerRect.top : triggerRect.bottom;

        // Vertical clamping (ensure it doesn't go off screen at the very top/bottom)
        const viewportTop = margin;
        const viewportBottom = window.innerHeight - margin;
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
        tooltipState?.((draft) => {
          draft.coords = { top, left };
          draft.arrowOffset = Math.max(-maxArrowOffset, Math.min(maxArrowOffset, rawArrowOffset));
        });
      }
    };

    if (!isVisible) return;

    updatePosition();
    // The first layout pass can measure a portal tooltip before its content has
    // settled. Recalculate once on the next frame so edge tooltips are clamped
    // using their final dimensions.
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isVisible, placement, tooltipState]);

  useEffect(() => {
    if (!isVisible) return;

    const handleWindowBlurOrHide = () => {
      hideTooltip();
    };

    window.addEventListener('blur', handleWindowBlurOrHide);
    document.addEventListener('visibilitychange', handleWindowBlurOrHide);

    return () => {
      window.removeEventListener('blur', handleWindowBlurOrHide);
      document.removeEventListener('visibilitychange', handleWindowBlurOrHide);
    };
  }, [isVisible, hideTooltip]);

  useEffect(() => {
    const suppressRestoredFocus = (event: Event) => {
      const opener = (event as CustomEvent<HTMLElement>).detail;
      if (opener && triggerRef.current?.contains(opener)) {
        shouldSuppressFocusRef.current = true;
        hideTooltip();
      }
    };

    document.addEventListener(DIALOG_FOCUS_RESTORED_EVENT, suppressRestoredFocus);
    return () => document.removeEventListener(DIALOG_FOCUS_RESTORED_EVENT, suppressRestoredFocus);
  }, [hideTooltip]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      isTriggerActiveRef.current = false;
      unregisterActiveTooltip(hideTooltip);
    };
  }, [hideTooltip]);

  if (!content) return children;

  const contentLines =
    typeof content === 'string' ? content.split('\n') : React.Children.toArray(content);
  const hasContentHeader =
    typeof content === 'string' && contentLines.length > 1 && String(contentLines[0] ?? '').trim();

  return (
    <>
      <div
        ref={triggerRef}
        className={`${styles.container} ${className}`}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onPointerDown={showTooltipOnTouch}
        onPointerUp={hideTooltipOnTouch}
        onPointerCancel={hideTooltipOnTouch}
        onTouchStart={showTooltipOnTouchStart}
        onTouchEnd={hideTooltipOnTouchEnd}
        onTouchCancel={hideTooltipOnTouchEnd}
        onFocus={showTooltipOnFocus}
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
