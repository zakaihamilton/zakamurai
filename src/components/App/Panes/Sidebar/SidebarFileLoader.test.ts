import { makeFileSystemApi } from '@/test-utils/fsMocks';
import { makeSidebarState } from '@/test-utils/stateMocks';
import { asNormalizedTreeNode, makeFlatTreeRow } from '@/test-utils/treeMocks';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useSidebarFileLoader from './SidebarFileLoader';
import { makeSidebarLoaderDefaultArgs } from './sidebarTestFixtures';

describe('useSidebarFileLoader', () => {
  let defaultArgs: ReturnType<typeof makeSidebarLoaderDefaultArgs>;

  beforeEach(() => {
    defaultArgs = makeSidebarLoaderDefaultArgs();
  });

  it('initializes correctly and returns all handlers', () => {
    const { result } = renderHook(() => useSidebarFileLoader(defaultArgs));

    expect(result.current.loadChildren).toBeTypeOf('function');
    expect(result.current.handleToggle).toBeTypeOf('function');
    expect(result.current.handleOpenFile).toBeTypeOf('function');
    expect(result.current.handleRename).toBeTypeOf('function');
    expect(result.current.handleCreate).toBeTypeOf('function');
    expect(result.current.handleDelete).toBeTypeOf('function');
  });

  describe('loadChildren', () => {
    it('loads directory entries in local mode and collapses node_modules folders', async () => {
      const setLoadingPaths = vi.fn();
      const mockDirHandle = {
        entries: async function* () {
          yield ['index.js', { kind: 'file', name: 'index.js' }];
          yield ['node_modules', { kind: 'directory', name: 'node_modules' }];
          yield ['src', { kind: 'directory', name: 'src' }];
        },
      } as unknown as FileSystemDirectoryHandle;
      const sidebarState = makeSidebarState({
        folderTree: [
          asNormalizedTreeNode({
            name: 'project',
            type: 'folder',
            path: ['project'],
          }),
        ],
        expandedFolders: {},
      });

      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs: makeFileSystemApi({ mode: 'local' }),
          sidebarState,
          setLoadingPaths,
        }),
      );

      const row = makeFlatTreeRow({
        item: asNormalizedTreeNode({
          name: 'project',
          type: 'folder',
          path: ['project'],
          handle: mockDirHandle,
        }),
        path: ['project'],
        pathStr: 'project',
      });

      await result.current.loadChildren(row);

      expect(setLoadingPaths).toHaveBeenCalled();
      expect(sidebarState).toHaveBeenCalled();
      expect(sidebarState.folderTree[0]?.children?.map((child) => child.name)).toEqual([
        'node_modules',
        'src',
        'index.js',
      ]);
      expect(sidebarState.expandedFolders['project/node_modules']).toBe(false);
    });

    it('logs errors when directory loading fails', async () => {
      const setLoadingPaths = vi.fn();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockDirHandle = {
        entries: () => ({
          [Symbol.asyncIterator]() {
            return {
              next: () => Promise.reject(new Error('Permission denied')),
            };
          },
        }),
      } as unknown as FileSystemDirectoryHandle;
      const sidebarState = makeSidebarState({
        folderTree: [
          asNormalizedTreeNode({
            name: 'project',
            type: 'folder',
            path: ['project'],
          }),
        ],
      });
      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs: makeFileSystemApi({ mode: 'local' }),
          sidebarState,
          setLoadingPaths,
        }),
      );

      await result.current.loadChildren(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({
            name: 'project',
            type: 'folder',
            path: ['project'],
            handle: mockDirHandle,
          }),
          path: ['project'],
          pathStr: 'project',
        }),
      );

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('returns early for non-local mode', async () => {
      const setLoadingPaths = vi.fn();
      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          setLoadingPaths,
        }),
      );

      await result.current.loadChildren(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({
            name: 'src',
            type: 'folder',
            path: ['src'],
            handle: {} as FileSystemDirectoryHandle,
          }),
          path: ['src'],
          pathStr: 'src',
        }),
      );

      expect(setLoadingPaths).not.toHaveBeenCalled();
    });

    it('returns early for non-folder rows', async () => {
      const setLoadingPaths = vi.fn();
      const fs = makeFileSystemApi({ mode: 'local' });
      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs,
          setLoadingPaths,
        }),
      );

      await result.current.loadChildren(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({
            name: 'App.js',
            type: 'file',
            path: ['src', 'App.js'],
            handle: {} as FileSystemFileHandle,
          }),
          path: ['src', 'App.js'],
          pathStr: 'src/App.js',
        }),
      );

      expect(setLoadingPaths).not.toHaveBeenCalled();
    });

    it('returns early when folder has no handle', async () => {
      const setLoadingPaths = vi.fn();
      const fs = makeFileSystemApi({ mode: 'local' });
      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs,
          setLoadingPaths,
        }),
      );

      await result.current.loadChildren(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({ name: 'src', type: 'folder', path: ['src'] }),
          path: ['src'],
          pathStr: 'src',
        }),
      );

      expect(setLoadingPaths).not.toHaveBeenCalled();
    });

    it('returns early when children are already loaded unless forced', async () => {
      const setLoadingPaths = vi.fn();
      const fs = makeFileSystemApi({ mode: 'local' });
      const mockDirHandle = {
        entries: async function* () {
          yield ['index.js', { kind: 'file', name: 'index.js' }];
        },
      } as unknown as FileSystemDirectoryHandle;
      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs,
          setLoadingPaths,
        }),
      );

      const row = makeFlatTreeRow({
        item: asNormalizedTreeNode({
          name: 'src',
          type: 'folder',
          path: ['src'],
          handle: mockDirHandle,
          children: [
            asNormalizedTreeNode({ name: 'index.js', type: 'file', path: ['src', 'index.js'] }),
          ],
        }),
        path: ['src'],
        pathStr: 'src',
      });

      await result.current.loadChildren(row);
      expect(setLoadingPaths).not.toHaveBeenCalled();

      await result.current.loadChildren(row, true);
      expect(setLoadingPaths).toHaveBeenCalled();
    });
  });

  describe('handleToggle', () => {
    it('ignores non-folder rows', () => {
      const sidebarState = makeSidebarState();
      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          sidebarState,
        }),
      );

      result.current.handleToggle(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['src', 'App.js'] }),
          path: ['src', 'App.js'],
          pathStr: 'src/App.js',
        }),
      );

      expect(sidebarState).not.toHaveBeenCalled();
    });

    it('skips root rows', () => {
      const sidebarState = makeSidebarState();
      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          sidebarState,
        }),
      );

      result.current.handleToggle(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({
            name: 'Project',
            type: 'folder',
            path: [],
            isRoot: true,
          }),
        }),
      );

      expect(sidebarState).not.toHaveBeenCalled();
    });

    it('toggles folder expansion and loads children when expanding', async () => {
      const sidebarState = makeSidebarState({ expandedFolders: {} });
      const fs = makeFileSystemApi({ mode: 'local' });
      const mockDirHandle = {
        entries: async function* () {
          yield ['index.js', { kind: 'file', name: 'index.js' }];
        },
      } as unknown as FileSystemDirectoryHandle;
      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs,
          sidebarState,
        }),
      );

      const row = makeFlatTreeRow({
        item: asNormalizedTreeNode({
          name: 'src',
          type: 'folder',
          path: ['src'],
          handle: mockDirHandle,
        }),
        path: ['src'],
        pathStr: 'src',
      });

      result.current.handleToggle(row);
      expect(sidebarState).toHaveBeenCalled();
      expect(sidebarState.expandedFolders.src).toBe(true);
    });

    it('collapses expanded folders without reloading children', () => {
      const sidebarState = makeSidebarState({ expandedFolders: { src: true } });
      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          sidebarState,
        }),
      );

      const row = makeFlatTreeRow({
        item: asNormalizedTreeNode({
          name: 'src',
          type: 'folder',
          path: ['src'],
          children: [
            asNormalizedTreeNode({ name: 'index.js', type: 'file', path: ['src', 'index.js'] }),
          ],
        }),
        path: ['src'],
        pathStr: 'src',
      });

      result.current.handleToggle(row);
      expect(sidebarState.expandedFolders.src).toBe(false);
    });

    it('forces expansion when expandOnly is set', () => {
      const sidebarState = makeSidebarState({ expandedFolders: { src: false } });
      const fs = makeFileSystemApi({ mode: 'local' });
      const mockDirHandle = {
        entries: async function* () {
          yield ['index.js', { kind: 'file', name: 'index.js' }];
        },
      } as unknown as FileSystemDirectoryHandle;
      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs,
          sidebarState,
        }),
      );

      const row = makeFlatTreeRow({
        item: asNormalizedTreeNode({
          name: 'src',
          type: 'folder',
          path: ['src'],
          handle: mockDirHandle,
        }),
        path: ['src'],
        pathStr: 'src',
      });

      result.current.handleToggle(row, { expandOnly: true });
      expect(sidebarState.expandedFolders.src).toBe(true);
    });
  });
});
