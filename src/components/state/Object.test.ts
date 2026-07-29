import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createObject, filterObjectByKeys, objectChangedKeys } from './Object';
import { setInDraft } from './StateUtils';

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
      const obj = createObject<Record<string, number>>({ a: 1, b: 2 });
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

      await vi.runAllTimersAsync();

      expect(handler).toHaveBeenCalledWith(['a']);
    });

    it('supports functional updates (draft)', async () => {
      const obj = createObject<Record<string, number>>({ a: 1, b: 2 });
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
      const obj = createObject<Record<string, number>>({ a: 1 });
      const handler = vi.fn();
      obj.__monitor(null, handler);

      obj.a = 2;
      obj.b = 3;
      obj.c = 4;

      await vi.runAllTimersAsync();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(['a', 'b', 'c']);
    });

    it('fires parent keys for nested map/array mutation hygiene paths', async () => {
      const obj = createObject({
        isCompleting: { 'a.js': false },
        completionActivity: {},
        expandedFolders: { src: true },
        openTabs: [{ id: 'a.js' }],
        history: { past: [{ id: 1 }, { id: 2 }], future: [] as Array<{ id: number }> },
        selectedLines: { 'a.js': [1] },
      });
      const handler = vi.fn();
      obj.__monitor(null, handler);

      obj((draft) => {
        setInDraft(draft, ['isCompleting', 'a.js'], true);
        setInDraft(draft, ['completionActivity', 'a.js'], { status: 'thinking' });
        setInDraft(draft, ['expandedFolders', 'src/lib'], true);
        draft.openTabs = [...draft.openTabs, { id: 'b.js' }];
        const past = [...draft.history.past];
        past.pop();
        draft.history = { ...draft.history, past, future: [{ id: 2 }] };
        setInDraft(draft, ['selectedLines', 'a.js'], [1, 2]);
      });

      await vi.runAllTimersAsync();

      const keys = handler.mock.calls.flat().flat();
      expect(keys).toEqual(
        expect.arrayContaining([
          'isCompleting',
          'completionActivity',
          'expandedFolders',
          'openTabs',
          'history',
          'selectedLines',
        ]),
      );
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
