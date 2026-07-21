import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useScrollHandler from './ScrollHandler';

describe('useScrollHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('scrolls from shouldScrollRef and clears it', () => {
    const scrollTo = vi.fn();
    const scrollContainerRef = { current: { scrollTo } };
    const shouldScrollRef = { current: { filePath: 'a.js', line: 5 } };
    const state = {};

    renderHook(() =>
      useScrollHandler({
        filePath: 'a.js',
        state,
        scrollContainerRef,
        shouldScrollRef,
      }),
    );

    vi.advanceTimersByTime(100);

    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth', top: expect.any(Number) }),
    );
    expect(shouldScrollRef.current).toBeNull();
  });

  it('scrolls from global shouldScrollTo when timestamp changes', () => {
    const scrollTo = vi.fn();
    const scrollContainerRef = { current: { scrollTo } };
    const shouldScrollRef = { current: null };
    const state = {
      shouldScrollTo: { filePath: 'a.js', line: 8, timestamp: 1 },
    };

    renderHook(() =>
      useScrollHandler({
        filePath: 'a.js',
        state,
        scrollContainerRef,
        shouldScrollRef,
      }),
    );

    vi.advanceTimersByTime(100);
    expect(scrollTo).toHaveBeenCalled();
  });
});
