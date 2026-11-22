import { createMockEditorState, createMockTabState } from '@/test-utils/editorMocks';
import { makeFileSystemApi } from '@/test-utils/fsMocks';
import { makeAppState, makeSidebarState } from '@/test-utils/stateMocks';
import { asNormalizedTreeNode, makeFlatTreeRow } from '@/test-utils/treeMocks';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useSidebarFileLoader from './SidebarFileLoader';
import { makeSidebarLoaderDefaultArgs } from './sidebarTestFixtures';

describe('useSidebarFileLoader — tree mutations', () => {
  let defaultArgs: ReturnType<typeof makeSidebarLoaderDefaultArgs>;

  beforeEach(() => {
    defaultArgs = makeSidebarLoaderDefaultArgs();
  });

  it('handles handleRename for root project', async () => {
    const appState = makeAppState({ isMobile: false });
    const addNotification = vi.fn();

    const { result } = renderHook(() =>
      useSidebarFileLoader({
        ...defaultArgs,
        appState,
        addNotification,
      }),
    );

    const res = await result.current.handleRename(
      makeFlatTreeRow({
        item: asNormalizedTreeNode({ name: 'Project', type: 'folder', path: [], isRoot: true }),
      }),
      'NewProject',
    );
    expect(res).toBe(true);
    expect(appState).toHaveBeenCalled();
    expect(addNotification).toHaveBeenCalledWith('Renamed project to "NewProject"', 'success');
  });

  it('handles handleRename for non-root file in sandbox mode', async () => {
    const sidebarState = makeSidebarState({ folderTree: [], expandedFolders: {} });
    const editorState = createMockEditorState({ fileContents: {} });
    const tabState = createMockTabState({
      openTabs: [{ id: 'src/App.js', label: 'App.js', type: 'file' }],
    });

    const { result } = renderHook(() =>
      useSidebarFileLoader({
        ...defaultArgs,
        sidebarState,
        editorState,
        tabState,
      }),
    );

    const res = await result.current.handleRename(
      makeFlatTreeRow({
        item: asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['src', 'App.js'] }),
        path: ['src', 'App.js'],
        pathStr: 'src/App.js',
      }),
      'Main.js',
    );
    expect(res).toBe(true);
    expect(sidebarState).toHaveBeenCalled();
    expect(editorState).toHaveBeenCalled();
    expect(tabState).toHaveBeenCalled();
  });

  it('handles handleDelete for file', async () => {
    const sidebarState = makeSidebarState({ folderTree: [] });
    const editorState = createMockEditorState({ fileContents: {} });
    const tabState = createMockTabState({
      openTabs: [{ id: 'src/App.js', label: 'App.js', type: 'file' }],
    });
    const addNotification = vi.fn();

    const { result } = renderHook(() =>
      useSidebarFileLoader({
        ...defaultArgs,
        sidebarState,
        editorState,
        tabState,
        addNotification,
      }),
    );

    await result.current.handleDelete(
      makeFlatTreeRow({
        item: asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['src', 'App.js'] }),
        path: ['src', 'App.js'],
        pathStr: 'src/App.js',
      }),
    );
    expect(sidebarState).toHaveBeenCalled();
    expect(tabState).toHaveBeenCalled();
    expect(editorState).toHaveBeenCalled();
    expect(addNotification).toHaveBeenCalledWith('"App.js" deleted', 'info');
  });

  it('handles handleCreate in sandbox (non-local) mode', async () => {
    const sidebarState = makeSidebarState();
    const addNotification = vi.fn();

    const { result } = renderHook(() =>
      useSidebarFileLoader({
        ...defaultArgs,
        sidebarState,
        addNotification,
      }),
    );

    const success = await result.current.handleCreate(
      makeFlatTreeRow({
        item: asNormalizedTreeNode({ name: 'src', type: 'folder', path: ['src'] }),
        path: ['src'],
        pathStr: 'src',
      }),
      'file',
      'index.js',
    );

    expect(success).toBe(true);
    expect(sidebarState).toHaveBeenCalled();
    expect(addNotification).toHaveBeenCalledWith('File "index.js" created', 'success');
  });

  it('handles handleCreate in local mode for files', async () => {
    const mockFileHandle = {
      createWritable: vi.fn().mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
      }),
    };
    const mockDirHandle = {
      entries: async function* () {},
      getFileHandle: vi.fn().mockResolvedValue(mockFileHandle),
    } as unknown as FileSystemDirectoryHandle;
    const fs = makeFileSystemApi({ mode: 'local', triggerRefresh: vi.fn() });
    const addNotification = vi.fn();

    const { result } = renderHook(() =>
      useSidebarFileLoader({
        ...defaultArgs,
        fs,
        addNotification,
      }),
    );

    const success = await result.current.handleCreate(
      makeFlatTreeRow({
        item: asNormalizedTreeNode({
          name: 'src',
          type: 'folder',
          path: ['src'],
          handle: mockDirHandle,
        }),
        path: ['src'],
        pathStr: 'src',
      }),
      'file',
      'index.js',
    );

    expect(success).toBe(true);
    expect(mockDirHandle.getFileHandle).toHaveBeenCalledWith('index.js', { create: true });
    expect(addNotification).toHaveBeenCalled();
  });

  it('handles handleCreate in local mode for folders', async () => {
    const mockDirHandle = {
      entries: async function* () {},
      getDirectoryHandle: vi.fn().mockResolvedValue({}),
    } as unknown as FileSystemDirectoryHandle;
    const fs = makeFileSystemApi({ mode: 'local', triggerRefresh: vi.fn() });

    const { result } = renderHook(() =>
      useSidebarFileLoader({
        ...defaultArgs,
        fs,
      }),
    );

    const success = await result.current.handleCreate(
      makeFlatTreeRow({
        item: asNormalizedTreeNode({
          name: 'src',
          type: 'folder',
          path: ['src'],
          handle: mockDirHandle,
        }),
        path: ['src'],
        pathStr: 'src',
      }),
      'folder',
      'components',
    );

    expect(success).toBe(true);
    expect(mockDirHandle.getDirectoryHandle).toHaveBeenCalledWith('components', { create: true });
  });

  it('handles handleCreate error in local mode gracefully', async () => {
    const mockDirHandle = {
      getFileHandle: vi.fn().mockRejectedValue(new Error('Permission denied')),
    } as unknown as FileSystemDirectoryHandle;
    const fs = makeFileSystemApi({ mode: 'local', triggerRefresh: vi.fn() });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useSidebarFileLoader({
        ...defaultArgs,
        fs,
      }),
    );

    const success = await result.current.handleCreate(
      makeFlatTreeRow({
        item: asNormalizedTreeNode({
          name: 'src',
          type: 'folder',
          path: ['src'],
          handle: mockDirHandle,
        }),
        path: ['src'],
        pathStr: 'src',
      }),
      'file',
      'index.js',
    );

    expect(success).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  describe('handleRename local mode', () => {
    it('renames via move() and triggers refresh', async () => {
      const move = vi.fn().mockResolvedValue(undefined);
      const triggerRefresh = vi.fn();
      const fs = makeFileSystemApi({ mode: 'local', triggerRefresh });
      const sidebarState = makeSidebarState({ folderTree: [], expandedFolders: {} });
      const addNotification = vi.fn();

      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs,
          sidebarState,
          addNotification,
        }),
      );

      const success = await result.current.handleRename(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({
            name: 'App.js',
            type: 'file',
            path: ['src', 'App.js'],
            handle: { move } as unknown as FileSystemFileHandle,
          }),
          path: ['src', 'App.js'],
          pathStr: 'src/App.js',
        }),
        'Main.js',
      );

      expect(success).toBe(true);
      expect(move).toHaveBeenCalledWith('Main.js');
      expect(triggerRefresh).toHaveBeenCalled();
      expect(addNotification).toHaveBeenCalledWith('Renamed to "Main.js"', 'success');
    });

    it('remaps nested tab ids when renaming a folder path', async () => {
      const sidebarState = makeSidebarState({ folderTree: [], expandedFolders: {} });
      const tabState = createMockTabState({
        openTabs: [
          { id: 'src/App.js', label: 'App.js', type: 'file' },
          { id: 'src/App.js/components/Card.js', label: 'Card.js', type: 'file' },
        ],
        activeTabId: 'src/App.js/components/Card.js',
      });

      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          sidebarState,
          tabState,
        }),
      );

      await result.current.handleRename(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['src', 'App.js'] }),
          path: ['src', 'App.js'],
          pathStr: 'src/App.js',
        }),
        'Main.js',
      );

      expect(tabState.openTabs.map((tab) => tab.id)).toEqual([
        'src/Main.js',
        'src/Main.js/components/Card.js',
      ]);
      expect(tabState.activeTabId).toBe('src/Main.js/components/Card.js');
    });

    it('returns false when move() is unavailable or fails', async () => {
      const fs = makeFileSystemApi({ mode: 'local', triggerRefresh: vi.fn() });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs,
        }),
      );

      const withoutMove = await result.current.handleRename(
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
        'Main.js',
      );
      expect(withoutMove).toBe(false);

      const move = vi.fn().mockRejectedValue(new Error('Permission denied'));
      const withFailedMove = await result.current.handleRename(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({
            name: 'Other.js',
            type: 'file',
            path: ['src', 'Other.js'],
            handle: { move } as unknown as FileSystemFileHandle,
          }),
          path: ['src', 'Other.js'],
          pathStr: 'src/Other.js',
        }),
        'Renamed.js',
      );
      expect(withFailedMove).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('handleDelete local mode', () => {
    it('removes entries via parent directory handle', async () => {
      const removeEntry = vi.fn().mockResolvedValue(undefined);
      const triggerRefresh = vi.fn();
      const fs = makeFileSystemApi({ mode: 'local', triggerRefresh });
      const parentHandle = { removeEntry } as unknown as FileSystemDirectoryHandle;
      const fileHandle = { name: 'App.js' } as FileSystemFileHandle;
      const sidebarState = makeSidebarState({
        folderTree: [
          asNormalizedTreeNode({
            name: 'src',
            type: 'folder',
            path: ['src'],
            handle: parentHandle,
            children: [
              asNormalizedTreeNode({
                name: 'App.js',
                type: 'file',
                path: ['src', 'App.js'],
                handle: fileHandle,
              }),
            ],
          }),
        ],
      });
      const tabState = createMockTabState({
        openTabs: [{ id: 'src/App.js', label: 'App.js', type: 'file' }],
        activeTabId: 'src/App.js',
      });
      const addNotification = vi.fn();

      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs,
          sidebarState,
          tabState,
          addNotification,
        }),
      );

      await result.current.handleDelete(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({
            name: 'App.js',
            type: 'file',
            path: ['src', 'App.js'],
            handle: fileHandle,
          }),
          path: ['src', 'App.js'],
          pathStr: 'src/App.js',
        }),
      );

      expect(removeEntry).toHaveBeenCalledWith('App.js', { recursive: true });
      expect(triggerRefresh).toHaveBeenCalled();
      expect(addNotification).toHaveBeenCalledWith('"App.js" deleted', 'info');
    });

    it('returns early when local delete fails', async () => {
      const removeEntry = vi.fn().mockRejectedValue(new Error('Permission denied'));
      const fs = makeFileSystemApi({ mode: 'local', triggerRefresh: vi.fn() });
      const parentHandle = { removeEntry } as unknown as FileSystemDirectoryHandle;
      const fileHandle = { name: 'App.js' } as FileSystemFileHandle;
      const sidebarState = makeSidebarState({
        folderTree: [
          asNormalizedTreeNode({
            name: 'src',
            type: 'folder',
            path: ['src'],
            handle: parentHandle,
            children: [
              asNormalizedTreeNode({
                name: 'App.js',
                type: 'file',
                path: ['src', 'App.js'],
                handle: fileHandle,
              }),
            ],
          }),
        ],
      });
      const tabState = createMockTabState({ openTabs: [] });
      const addNotification = vi.fn();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs,
          sidebarState,
          tabState,
          addNotification,
        }),
      );

      await result.current.handleDelete(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({
            name: 'App.js',
            type: 'file',
            path: ['src', 'App.js'],
            handle: fileHandle,
          }),
          path: ['src', 'App.js'],
          pathStr: 'src/App.js',
        }),
      );

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(addNotification).toHaveBeenCalledWith(
        'Could not delete "App.js": Permission denied',
        'error',
      );
      consoleErrorSpy.mockRestore();
    });
  });
});
