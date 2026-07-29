import type { FileSystemApi } from '@/components/App/types';
import type { TreeNode } from '@/components/state/domain-types';
import type { useFileSystem } from '@/components/Storage';
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
    writeFileAtPath: vi.fn(async () => true),
    readFileAtPath: vi.fn(async () => ''),
    deleteFileAtPath: vi.fn(async () => true),
    getFileHandleAtPath: vi.fn(async () => null),
    createFolder: vi.fn(async () => {}),
    deleteEntry: vi.fn(async () => {}),
    moveEntry: vi.fn(async () => {}),
    unlinkProject: vi.fn(async () => {}),
    isReady: true,
    ...overrides,
  };
}

/** Cast a FileSystemApi mock to the useFileSystem() return type in tests. */
export function asMockUseFileSystem(
  overrides: Partial<FileSystemApi> = {},
): ReturnType<typeof useFileSystem> {
  return makeFileSystemApi(overrides) as unknown as ReturnType<typeof useFileSystem>;
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
