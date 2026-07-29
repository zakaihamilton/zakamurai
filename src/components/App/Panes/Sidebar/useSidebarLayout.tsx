import { useEffect } from 'react';

const COLLAPSED_DESKTOP_WIDTH = 0;

/** Drives the desktop sidebar transition while preserving proxy-store ownership. */
export default function useSidebarLayout({
  isMobile,
  isOpen,
  sidebarWidth,
  animatedWidth,
  setAnimatedWidth,
}) {
  useEffect(() => {
    if (isMobile) return undefined;
    if (isOpen) {
      const frame = window.requestAnimationFrame(() => setAnimatedWidth(sidebarWidth));
      return () => window.cancelAnimationFrame(frame);
    }
    setAnimatedWidth(sidebarWidth);
    const frame = window.requestAnimationFrame(() => setAnimatedWidth(COLLAPSED_DESKTOP_WIDTH));
    return () => window.cancelAnimationFrame(frame);
  }, [isMobile, isOpen, setAnimatedWidth, sidebarWidth]);

  return { desktopWidth: `${String(isOpen ? animatedWidth : COLLAPSED_DESKTOP_WIDTH)}px` };
}
