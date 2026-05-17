import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMobileLikeDevice, shouldShowKeyboardShortcuts } from './keyboard';

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
});
