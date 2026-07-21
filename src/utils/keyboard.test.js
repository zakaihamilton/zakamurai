import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KeyboardShortcutState,
  isMobileLikeDevice,
  markKeyboardActivity,
  shouldShowKeyboardShortcuts,
  useShouldShowKeyboardShortcuts,
} from './keyboard';

describe('keyboard utilities', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 });
  });

  it('treats coarse pointer devices as mobile-like', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true });

    expect(isMobileLikeDevice()).toBe(true);
  });

  it('hides shortcuts on mobile-like devices until keyboard activity is detected', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true });

    expect(shouldShowKeyboardShortcuts()).toBe(false);

    window.sessionStorage.setItem('hasKeyboardActivity', 'true');

    expect(shouldShowKeyboardShortcuts()).toBe(true);
  });

  it('shows shortcuts on non-mobile devices', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false });

    expect(shouldShowKeyboardShortcuts()).toBe(true);
  });

  it('uses touch points and viewport size when no coarse pointer is present', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 2 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 768 });
    expect(isMobileLikeDevice()).toBe(true);

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 769 });
    expect(isMobileLikeDevice()).toBe(false);
  });

  it('supports environments without matchMedia', () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined });

    expect(isMobileLikeDevice()).toBe(false);

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    });
  });

  it('handles sessionStorage errors gracefully', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true });
    vi.spyOn(window.sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('Access Denied');
    });
    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('Access Denied');
    });

    expect(shouldShowKeyboardShortcuts()).toBe(false); // falls back to hasKeyboardActivity() which catches error and returns false
    expect(() => markKeyboardActivity()).not.toThrow();
  });

  it('useShouldShowKeyboardShortcuts hook handles keydown and resize', () => {
    const stateUpdater = vi.fn((cb) => {
      const draft = { shouldShow: false };
      cb(draft);
    });
    const mockState = Object.assign(stateUpdater, { shouldShow: false });
    vi.spyOn(KeyboardShortcutState, 'useState').mockReturnValue(mockState);

    renderHook(() => useShouldShowKeyboardShortcuts());

    // Trigger keydown to enable
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    });
    expect(stateUpdater).toHaveBeenCalled();

    // Trigger resize
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(stateUpdater).toHaveBeenCalledTimes(2);
  });

  it('ignores composing key events and falls back when hook state is empty', () => {
    const stateUpdater = vi.fn((callback) => callback({ shouldShow: false }));
    vi.spyOn(KeyboardShortcutState, 'useState').mockReturnValue(stateUpdater);
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false });

    const { result } = renderHook(() => useShouldShowKeyboardShortcuts());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { isComposing: true }));
    });
    expect(stateUpdater).not.toHaveBeenCalled();
  });
});
