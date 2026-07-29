import { MOBILE_BREAKPOINT } from '@/constants/Layout';
import { makeAppState, makeSidebarState } from '@/test-utils/stateMocks';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWindowResize } from './WindowResize';

describe('useWindowResize', () => {
  let appStateMock: ReturnType<typeof makeAppState>;
  let sidebarStateMock: ReturnType<typeof makeSidebarState>;

  beforeEach(() => {
    appStateMock = makeAppState({ isMobile: false });
    sidebarStateMock = makeSidebarState({
      isSidebarPopupOpen: false,
      isAIInputPopupOpen: false,
    });

    window.innerWidth = 1024;
  });

  it('updates appState when window is resized below breakpoint', () => {
    renderHook(() => useWindowResize(appStateMock, sidebarStateMock));

    expect(appStateMock.isMobile).toBe(false);

    window.innerWidth = MOBILE_BREAKPOINT - 10;
    window.dispatchEvent(new Event('resize'));

    expect(appStateMock.isMobile).toBe(true);
  });

  it('closes popups when entering mobile layout', () => {
    sidebarStateMock.isSidebarPopupOpen = true;
    sidebarStateMock.isAIInputPopupOpen = true;

    const { rerender } = renderHook(() => useWindowResize(appStateMock, sidebarStateMock));

    appStateMock.isMobile = true;
    rerender();

    expect(sidebarStateMock.isSidebarPopupOpen).toBe(false);
    expect(sidebarStateMock.isAIInputPopupOpen).toBe(false);
  });

  it('closes popups when leaving mobile layout', () => {
    window.innerWidth = MOBILE_BREAKPOINT - 10;
    appStateMock.isMobile = true;

    const { rerender } = renderHook(() => useWindowResize(appStateMock, sidebarStateMock));

    sidebarStateMock.isSidebarPopupOpen = true;
    sidebarStateMock.isAIInputPopupOpen = true;

    window.innerWidth = 1024;
    window.dispatchEvent(new Event('resize'));
    rerender();

    expect(sidebarStateMock.isSidebarPopupOpen).toBe(false);
    expect(sidebarStateMock.isAIInputPopupOpen).toBe(false);
  });
});
