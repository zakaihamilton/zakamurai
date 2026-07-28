import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useEditorNavigationMode from './useEditorNavigationMode';

describe('useEditorNavigationMode', () => {
  afterEach(() => {
    vi.useRealTimers();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }));
    });
  });

  it('enables command navigation only after the deliberate hold delay', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEditorNavigationMode());

    expect(result.current).toBe(false);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta' }));
      vi.advanceTimersByTime(999);
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }));
    });
    expect(result.current).toBe(false);
  });
});
