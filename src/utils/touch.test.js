import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

    const touchEvent = {
      touches: [{ clientX: 10, clientY: 20, pageX: 10, pageY: 20 }],
    };

    handlers.onTouchStart(touchEvent);

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

    handlers.onTouchStart({
      touches: [{ clientX: 10, clientY: 20 }],
    });

    handlers.onTouchMove({
      touches: [{ clientX: 25, clientY: 20 }], // Moved 15px (dx = 15)
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('cancels callback if touch ends early', async () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useLongPress(callback, { delay: 300 }));

    const handlers = result.current;

    handlers.onTouchStart({
      touches: [{ clientX: 10, clientY: 20 }],
    });

    const preventDefault = vi.fn();
    handlers.onTouchEnd({ preventDefault });

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

    handlers.onTouchStart({
      touches: [{ clientX: 10, clientY: 20 }],
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const preventDefault = vi.fn();
    handlers.onTouchEnd({ preventDefault });

    expect(preventDefault).toHaveBeenCalled();
  });
});
