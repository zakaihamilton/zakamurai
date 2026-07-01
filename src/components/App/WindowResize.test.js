import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useWindowResize } from './WindowResize';
import { MOBILE_BREAKPOINT } from '@/constants/Layout';

describe('useWindowResize', () => {
  let appStateMock;
  let sidebarStateMock;

  beforeEach(() => {
    // Mock the state proxy behavior
    appStateMock = vi.fn((cb) => {
      const draft = { isMobile: appStateMock.isMobile };
      cb(draft);
      appStateMock.isMobile = draft.isMobile;
    });
    appStateMock.isMobile = false;

    sidebarStateMock = vi.fn((cb) => {
      const draft = {
        isSidebarPopupOpen: sidebarStateMock.isSidebarPopupOpen,
        isAIInputPopupOpen: sidebarStateMock.isAIInputPopupOpen,
      };
      cb(draft);
      sidebarStateMock.isSidebarPopupOpen = draft.isSidebarPopupOpen;
      sidebarStateMock.isAIInputPopupOpen = draft.isAIInputPopupOpen;
    });
    sidebarStateMock.isSidebarPopupOpen = false;
    sidebarStateMock.isAIInputPopupOpen = false;

    // Reset window width
    window.innerWidth = 1024;
  });

  it('updates appState when window is resized below breakpoint', () => {
    renderHook(() => useWindowResize(appStateMock, sidebarStateMock));

    // Initially at 1024px (desktop)
    expect(appStateMock.isMobile).toBe(false);

    // Resize window to mobile width
    window.innerWidth = MOBILE_BREAKPOINT - 10;
    window.dispatchEvent(new Event('resize'));

    expect(appStateMock.isMobile).toBe(true);
  });

  it('closes popups when entering mobile layout', () => {
    sidebarStateMock.isSidebarPopupOpen = true;
    sidebarStateMock.isAIInputPopupOpen = true;

    const { rerender } = renderHook(
      () => useWindowResize(appStateMock, sidebarStateMock)
    );

    // Transition from desktop to mobile
    appStateMock.isMobile = true;
    rerender();

    expect(sidebarStateMock.isSidebarPopupOpen).toBe(false);
    expect(sidebarStateMock.isAIInputPopupOpen).toBe(false);
  });

  it('closes popups when leaving mobile layout', () => {
    // Start in mobile layout
    window.innerWidth = MOBILE_BREAKPOINT - 10;
    appStateMock.isMobile = true;

    const { rerender } = renderHook(
      () => useWindowResize(appStateMock, sidebarStateMock)
    );

    // Now set popups to true
    sidebarStateMock.isSidebarPopupOpen = true;
    sidebarStateMock.isAIInputPopupOpen = true;

    // Transition from mobile to desktop
    window.innerWidth = 1024;
    window.dispatchEvent(new Event('resize'));
    rerender();

    expect(sidebarStateMock.isSidebarPopupOpen).toBe(false);
    expect(sidebarStateMock.isAIInputPopupOpen).toBe(false);
  });
});
