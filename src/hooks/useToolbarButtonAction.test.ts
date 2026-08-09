import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToolbarButtonAction } from './useToolbarButtonAction';

describe('useToolbarButtonAction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles synchronous actions with press and completed states', async () => {
    const action = vi.fn();
    const { result } = renderHook(() => useToolbarButtonAction(action));

    expect(result.current.isPressed).toBe(false);
    expect(result.current.isCompleted).toBe(false);

    await act(async () => {
      await result.current.handleClick();
    });

    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.isCompleted).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(result.current.isCompleted).toBe(false);
  });

  it('handles asynchronous actions with executing and completed states', async () => {
    let resolvePromise: () => void = () => {};
    const asyncAction = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useToolbarButtonAction(asyncAction, { feedbackDuration: 1000 }),
    );

    let promise: Promise<void>;
    act(() => {
      promise = result.current.handleClick();
    });

    expect(result.current.isExecuting).toBe(true);
    expect(result.current.isCompleted).toBe(false);

    await act(async () => {
      resolvePromise();
      await promise;
    });

    expect(result.current.isExecuting).toBe(false);
    expect(result.current.isCompleted).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.isCompleted).toBe(false);
  });

  it('resets state cleanly if action throws an error', async () => {
    const failingAction = vi.fn().mockRejectedValue(new Error('Failed'));
    const { result } = renderHook(() => useToolbarButtonAction(failingAction));

    await act(async () => {
      await expect(result.current.handleClick()).rejects.toThrow('Failed');
    });

    expect(result.current.isPressed).toBe(false);
    expect(result.current.isExecuting).toBe(false);
    expect(result.current.isCompleted).toBe(false);
  });
});
