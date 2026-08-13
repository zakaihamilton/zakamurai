import type { ChangeSetStateShape, FileSystemStateShape } from '@/types/domain-types';
import type { Draft, StateStore } from 'triactor';
import type { Mock } from 'vitest';
import { vi } from 'vitest';

export function createMockStateStore<T extends object>(
  initial: T,
): StateStore<T> & { mock: Mock<(updater: (draft: Draft<T>) => void) => void> } {
  const state = initial;
  const syncProps = () => {
    for (const key of Object.keys(state) as (keyof T)[]) {
      (mock as unknown as Record<string, unknown>)[key as string] = state[key];
    }
  };
  const mock = vi.fn((updater: (draft: Draft<T>) => void) => {
    const draft = { ...state } as Draft<T>;
    updater(draft);
    Object.assign(state, draft);
    syncProps();
  });

  Object.assign(mock, state);
  syncProps();

  const proxy = new Proxy(mock, {
    get(target, prop, receiver) {
      if (prop === 'mock') {
        return mock;
      }
      if (typeof prop === 'string' && !prop.startsWith('__') && prop in state) {
        return (state as Record<string, unknown>)[prop];
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      if (typeof prop === 'string' && !prop.startsWith('__') && prop in state) {
        (state as Record<string, unknown>)[prop] = value;
      }
      return Reflect.set(target, prop, value, receiver);
    },
  });

  return proxy as unknown as StateStore<T> & {
    mock: Mock<(updater: (draft: Draft<T>) => void) => void>;
  };
}

export function asDirectoryHandle(value: Record<string, unknown>): FileSystemDirectoryHandle {
  return value as unknown as FileSystemDirectoryHandle;
}

export function asFileSystemStore(
  initial: Partial<FileSystemStateShape> = {},
): StateStore<FileSystemStateShape> {
  return createMockStateStore<FileSystemStateShape>({
    rootHandle: null,
    currentDirHandle: null,
    files: [],
    mode: null,
    error: null,
    version: 0,
    refreshTrigger: 0,
    isReady: false,
    ...initial,
  });
}

export function asChangeSetStore(
  initial: Partial<ChangeSetStateShape> = {},
): StateStore<ChangeSetStateShape> & { state: ChangeSetStateShape } {
  const state: ChangeSetStateShape = {
    activeId: null,
    items: [],
    ...initial,
  };
  const store = createMockStateStore<ChangeSetStateShape>(state);
  return Object.assign(store, { state }) as StateStore<ChangeSetStateShape> & {
    state: ChangeSetStateShape;
  };
}
