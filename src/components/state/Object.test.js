import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createObject, filterObjectByKeys, objectChangedKeys } from './Object';

describe('Object utils', () => {
  describe('objectChangedKeys', () => {
    it('returns all keys if lengths differ', () => {
      expect(objectChangedKeys({ a: 1 }, { a: 1, b: 2 })).toEqual(['a']);
    });

    it('returns changed keys', () => {
      expect(objectChangedKeys({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(['b']);
    });

    it('returns empty array if objects are identical', () => {
      expect(objectChangedKeys({ a: 1 }, { a: 1 })).toEqual([]);
    });
  });

  describe('createObject', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('creates a proxy that behaves like an object', () => {
      const obj = createObject({ a: 1, b: 2 });
      expect(obj.a).toBe(1);
      expect(obj.b).toBe(2);
      obj.c = 3;
      expect(obj.c).toBe(3);
    });

    it('notifies monitors on property change', async () => {
      const obj = createObject({ a: 1 });
      const handler = vi.fn();
      obj.__monitor(null, handler);

      obj.a = 2;

      // Notification happens in a microtask
      await vi.runAllTimersAsync();

      expect(handler).toHaveBeenCalledWith(['a']);
    });

    it('supports functional updates (draft)', async () => {
      const obj = createObject({ a: 1, b: 2 });
      const handler = vi.fn();
      obj.__monitor(null, handler);

      obj((draft) => {
        draft.a = 10;
        draft.b = 20;
        draft.c = 30;
      });

      await vi.runAllTimersAsync();

      expect(obj.a).toBe(10);
      expect(obj.b).toBe(20);
      expect(obj.c).toBe(30);
      expect(handler).toHaveBeenCalledWith(['a', 'b', 'c']);
    });

    it('batch notifications within the same microtask', async () => {
      const obj = createObject({ a: 1 });
      const handler = vi.fn();
      obj.__monitor(null, handler);

      obj.a = 2;
      obj.b = 3;
      obj.c = 4;

      await vi.runAllTimersAsync();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(['a', 'b', 'c']);
    });
  });

  describe('filterObjectByKeys', () => {
    it('filters object correctly', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const [filtered, leftover] = filterObjectByKeys(obj, ['a', 'c']);
      expect(filtered).toEqual({ a: 1, c: 3 });
      expect(leftover).toEqual({ b: 2 });
    });
  });
});
