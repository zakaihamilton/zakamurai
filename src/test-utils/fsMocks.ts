import type { FileSystemApi } from '@/components/App/types';
import type { TreeNode } from '@/components/state/domain-types';
import { vi } from 'vitest';

export function makeFileSystemApi(overrides: Partial<FileSystemApi> = {}): FileSystemApi {
  return {
    mode: null,
    files: [] as TreeNode[],
    error: null,
    version: 0,
    currentDirHandle: null,
    rootHandle: null,
    mountOPFS: vi.fn(async () => {}),
    mountLocal: vi.fn(async () => {}),
    refreshDirectory: vi.fn(async () => {}),
    triggerRefresh: vi.fn(),
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => {}),
    writeFileAtPath: vi.fn(async () => {}),
    readFileAtPath: vi.fn(async () => ''),
    deleteFileAtPath: vi.fn(async () => {}),
    getFileHandleAtPath: vi.fn(async () => null),
    createFolder: vi.fn(async () => {}),
    deleteEntry: vi.fn(async () => {}),
    moveEntry: vi.fn(async () => {}),
    unlinkProject: vi.fn(async () => {}),
    isReady: true,
    ...overrides,
  };
}

export function makeDirectoryHandle(name: string): FileSystemDirectoryHandle {
  return { name, kind: 'directory' } as FileSystemDirectoryHandle;
}

export function makeFileHandle(name: string): FileSystemFileHandle {
  return {
    name,
    kind: 'file',
    getFile: vi.fn(async () => ({ text: async () => '' })),
  } as unknown as FileSystemFileHandle;
}
