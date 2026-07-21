import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { isSelectorMatch, useObjectHandler, useObjectState } from './State';

describe('State utils', () => {
  describe('isSelectorMatch', () => {
    it('returns true when selector is undefined', () => {
      expect(isSelectorMatch(undefined, 'anyKey')).toBe(true);
    });

    it('returns false when selector is falsy', () => {
      expect(isSelectorMatch(null, 'anyKey')).toBe(false);
      expect(isSelectorMatch('', 'anyKey')).toBe(false);
    });

    it('returns true when selector matches key (string)', () => {
      expect(isSelectorMatch('key', 'key')).toBe(true);
      expect(isSelectorMatch('key', 'other')).toBe(false);
    });

    it('returns true when selector matches key (function)', () => {
      expect(isSelectorMatch((key) => key === 'key', 'key')).toBe(true);
      expect(isSelectorMatch((key) => key === 'key', 'other')).toBe(false);
    });

    it('returns true when selector matches key (array)', () => {
      expect(isSelectorMatch(['key', 'other'], 'key')).toBe(true);
      expect(isSelectorMatch(['key', 'other'], 'other')).toBe(true);
      expect(isSelectorMatch(['key', 'other'], 'third')).toBe(false);
    });

    it('returns true when selector matches key (object map)', () => {
      expect(isSelectorMatch({ key: true, other: false }, 'key')).toBe(true);
      expect(isSelectorMatch({ key: true, other: false }, 'other')).toBe(false);
      expect(isSelectorMatch({ key: true, other: false }, 'third')).toBe(undefined);
    });
  });

  describe('useObjectState', () => {
    it('returns null when object is null', () => {
      const { result } = renderHook(() => useObjectState(null));
      expect(result.current).toBeNull();
    });

    it('returns the object when no selector', () => {
      const obj = { __monitor: vi.fn(), __unmonitor: vi.fn(), __counter: 0, value: 42 };
      const { result } = renderHook(() => useObjectState(obj));
      expect(result.current).toBe(obj);
    });

    it('returns string property when selector is a string', () => {
      const obj = { __monitor: vi.fn(), __unmonitor: vi.fn(), value: 'hello' };
      const { result } = renderHook(() => useObjectState(obj, 'value'));
      expect(result.current).toBe(obj);
    });

    it('subscribes and unsubscribes via __monitor/__unmonitor', () => {
      const monitor = vi.fn();
      const unmonitor = vi.fn();
      const obj = { __monitor: monitor, __unmonitor: unmonitor, __counter: 0 };

      const { unmount } = renderHook(() => useObjectState(obj));
      expect(monitor).toHaveBeenCalled();
      unmount();
      expect(unmonitor).toHaveBeenCalled();
    });

    it('does not subscribe if __monitor is not a function', () => {
      const obj = { value: 1 }; // No __monitor
      const { result } = renderHook(() => useObjectState(obj));
      expect(result.current).toBe(obj);
    });
  });

  describe('useObjectHandler', () => {
    it('calls monitor and handler on mount', () => {
      const monitor = vi.fn();
      const unmonitor = vi.fn();
      const obj = { __monitor: monitor, __unmonitor: unmonitor };
      const handler = vi.fn();

      renderHook(() => useObjectHandler(obj, handler));

      expect(monitor).toHaveBeenCalledWith(null, handler, undefined);
      expect(handler).toHaveBeenCalledWith(null);
    });

    it('calls unmonitor on unmount', () => {
      const monitor = vi.fn();
      const unmonitor = vi.fn();
      const obj = { __monitor: monitor, __unmonitor: unmonitor };
      const handler = vi.fn();

      const { unmount } = renderHook(() => useObjectHandler(obj, handler));
      unmount();

      expect(unmonitor).toHaveBeenCalledWith(null, handler, undefined);
    });

    it('does nothing when object or handler is null', () => {
      // Should not throw
      const { result } = renderHook(() => useObjectHandler(null, null));
      expect(result.current).toBeNull();
    });

    it('does nothing when object has no __monitor', () => {
      const handler = vi.fn();
      renderHook(() => useObjectHandler({ value: 1 }, handler));
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
