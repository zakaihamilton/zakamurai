import { describe, expect, it } from 'vitest';
import {
  asChangeSetStore,
  asDirectoryHandle,
  asFileSystemStore,
  createMockStateStore,
} from './vitest-mocks';

describe('vitest-mocks', () => {
  describe('createMockStateStore', () => {
    it('updates state through the mock updater and exposes properties', () => {
      type Shape = { count: number; label: string };
      const store = createMockStateStore<Shape>({ count: 0, label: 'start' });

      expect(store.count).toBe(0);
      expect(store.label).toBe('start');

      store.mock((draft) => {
        draft.count = 2;
        draft.label = 'updated';
      });

      expect(store.count).toBe(2);
      expect(store.label).toBe('updated');
      expect(store.mock).toHaveBeenCalledTimes(1);
    });

    it('supports property assignment through the proxy', () => {
      const store = createMockStateStore({ value: 1 });
      store.value = 5;
      expect(store.value).toBe(5);
    });
  });

  describe('asDirectoryHandle', () => {
    it('casts a plain object to FileSystemDirectoryHandle', () => {
      const handle = asDirectoryHandle({ name: 'root' });
      expect((handle as unknown as { name: string }).name).toBe('root');
    });
  });

  describe('asFileSystemStore', () => {
    it('creates a file system store with defaults and overrides', () => {
      const store = asFileSystemStore({ mode: 'sandbox', isReady: true });
      expect(store.mode).toBe('sandbox');
      expect(store.isReady).toBe(true);
      expect(store.files).toEqual([]);
      expect(store.rootHandle).toBeNull();
    });
  });

  describe('asChangeSetStore', () => {
    it('creates a change set store with shared state reference', () => {
      const store = asChangeSetStore({
        activeId: 'cs-1',
        items: [
          {
            id: 'cs-1',
            request: 'test',
            files: [],
            status: 'pending',
            createdAt: 1,
          },
        ],
      });
      expect(store.activeId).toBe('cs-1');
      expect(store.state.items).toHaveLength(1);
      store.activeId = 'cs-2';
      expect(store.state.activeId).toBe('cs-2');
    });
  });
});
