import { createMockEditorState, createMockShouldScrollRef } from '@/test-utils/editorMocks';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useScrollHandler from './ScrollHandler';
import type { ScrollContainerRef } from './types';

describe('useScrollHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('scrolls from shouldScrollRef and clears it', () => {
    const scrollTo = vi.fn();
    const scrollContainerRef = { current: { scrollTo } } as unknown as ScrollContainerRef;
    const shouldScrollRef = createMockShouldScrollRef({ filePath: 'a.js', line: 5 });
    const state = createMockEditorState();

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
    const scrollContainerRef = { current: { scrollTo } } as unknown as ScrollContainerRef;
    const shouldScrollRef = createMockShouldScrollRef();
    const state = createMockEditorState({
      shouldScrollTo: { filePath: 'a.js', line: 8, timestamp: 1 },
    });

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
