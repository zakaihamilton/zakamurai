import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockTouchEvent } from '@/test-utils/domMocks';
import { useLongPress } from './touch';

describe('useLongPress hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    if (typeof window !== 'undefined') {
      window.ontouchstart = () => {};
    }
  });

  it('triggers onLongPress callback after delay', async () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useLongPress(callback, { delay: 300 }));

    const handlers = result.current;
    expect(handlers.onTouchStart).toBeDefined();

    handlers.onTouchStart?.(mockTouchEvent({ touches: [{ clientX: 10, clientY: 20 }] }));

    expect(callback).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(callback).toHaveBeenCalled();
  });

  it('cancels callback if touch moves beyond threshold', async () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useLongPress(callback, { delay: 300, threshold: 10 }));

    const handlers = result.current;

    handlers.onTouchStart?.(mockTouchEvent({ touches: [{ clientX: 10, clientY: 20 }] }));

    handlers.onTouchMove?.(mockTouchEvent({ touches: [{ clientX: 25, clientY: 20 }] }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('cancels callback if touch ends early', async () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useLongPress(callback, { delay: 300 }));

    const handlers = result.current;

    handlers.onTouchStart?.(mockTouchEvent({ touches: [{ clientX: 10, clientY: 20 }] }));

    const preventDefault = vi.fn();
    handlers.onTouchEnd?.(mockTouchEvent({ preventDefault }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(callback).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('prevents default on touch end if long press occurred', async () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useLongPress(callback, { delay: 300 }));

    const handlers = result.current;

    handlers.onTouchStart?.(mockTouchEvent({ touches: [{ clientX: 10, clientY: 20 }] }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const preventDefault = vi.fn();
    handlers.onTouchEnd?.(mockTouchEvent({ preventDefault }));

    expect(preventDefault).toHaveBeenCalled();
  });
});
