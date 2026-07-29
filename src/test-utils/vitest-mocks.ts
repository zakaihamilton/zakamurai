import type { ChangeSetStateShape, FileSystemStateShape } from '@/components/state/domain-types';
import type { Draft, StateStore } from '@/components/state/types';
import type { Mock } from 'vitest';
import { vi } from 'vitest';

export function createMockStateStore<T extends object>(
  initial: T,
): StateStore<T> & { mock: Mock<(updater: (draft: Draft<T>) => void) => void> } {
  let state = { ...initial };
  const mock = vi.fn((updater: (draft: Draft<T>) => void) => {
    const draft = { ...state } as Draft<T>;
    updater(draft);
    state = { ...draft } as T;
  });
  return Object.assign(mock, state, { mock }) as unknown as StateStore<T> & {
    mock: Mock<(updater: (draft: Draft<T>) => void) => void>;
  };
}

export function asDirectoryHandle(
  value: Record<string, unknown>,
): FileSystemDirectoryHandle {
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
  const state = {
    activeId: null,
    items: [],
    ...initial,
  };
  const store = createMockStateStore<ChangeSetStateShape>(state);
  return Object.assign(store, { state }) as StateStore<ChangeSetStateShape> & {
    state: ChangeSetStateShape;
  };
}
