import { createMockEditorState, createMockTabState } from '@/test-utils/editorMocks';
import { makeFileSystemApi } from '@/test-utils/fsMocks';
import { makeAppState, makeSidebarState } from '@/test-utils/stateMocks';
import { asNormalizedTreeNode, makeFlatTreeRow } from '@/test-utils/treeMocks';
import { FILE_VIEW_TYPES } from '@/utils/fileViews';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useSidebarFileLoader from './SidebarFileLoader';

describe('useSidebarFileLoader', () => {
  const defaultArgs = {
    fs: makeFileSystemApi({
      mode: 'sandbox',
      triggerRefresh: vi.fn(),
      readFile: vi.fn().mockResolvedValue('file text'),
    }),
    appState: makeAppState({ isMobile: false }),
    sidebarState: makeSidebarState(),
    tabState: createMockTabState(),
    editorState: createMockEditorState({ fileContents: { 'src/App.js': 'code' } }),
    setLoadingPaths: vi.fn(),
    addNotification: vi.fn(),
  };

  it('initializes correctly and returns all handlers', () => {
    const { result } = renderHook(() => useSidebarFileLoader(defaultArgs));

    expect(result.current.loadChildren).toBeTypeOf('function');
    expect(result.current.handleToggle).toBeTypeOf('function');
    expect(result.current.handleOpenFile).toBeTypeOf('function');
    expect(result.current.handleRename).toBeTypeOf('function');
    expect(result.current.handleCreate).toBeTypeOf('function');
    expect(result.current.handleDelete).toBeTypeOf('function');
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

  it('handles handleOpenFile in sandbox mode', async () => {
    const editorState = createMockEditorState({ fileContents: { 'src/App.js': 'code' } });
    const tabState = createMockTabState({ openTabs: [] });
    const sidebarState = makeSidebarState({ expandedFolders: {} });

    const { result } = renderHook(() =>
      useSidebarFileLoader({
        ...defaultArgs,
        editorState,
        tabState,
        sidebarState,
      }),
    );

    await result.current.handleOpenFile(
      makeFlatTreeRow({
        item: asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['src', 'App.js'] }),
        path: ['src', 'App.js'],
        pathStr: 'src/App.js',
      }),
    );

    expect(editorState).toHaveBeenCalled();
    expect(tabState).toHaveBeenCalled();
    expect(sidebarState).toHaveBeenCalled();
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

  describe('handleOpenFile', () => {
    it('loads media file text for token breakdown view', async () => {
      const readFile = vi.fn().mockResolvedValue('svg source');
      const fs = makeFileSystemApi({ mode: 'local', readFile });
      const editorState = createMockEditorState({ fileContents: {} });

      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs,
          editorState,
        }),
      );

      await result.current.handleOpenFile(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({
            name: 'photo.png',
            type: 'file',
            path: ['assets', 'photo.png'],
            handle: { name: 'photo.png' } as FileSystemFileHandle,
          }),
          path: ['assets', 'photo.png'],
          pathStr: 'assets/photo.png',
        }),
        { viewType: FILE_VIEW_TYPES.TOKEN_BREAKDOWN },
      );

      expect(readFile).toHaveBeenCalled();
      expect(editorState).toHaveBeenCalled();
    });

    it('reads local files via the filesystem handle', async () => {
      const readFile = vi.fn().mockResolvedValue('local content');
      const fileHandle = { name: 'App.js' } as FileSystemFileHandle;
      const fs = makeFileSystemApi({ mode: 'local', readFile });
      const editorState = createMockEditorState({ fileContents: {} });
      const tabState = createMockTabState({ openTabs: [] });

      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs,
          editorState,
          tabState,
        }),
      );

      await result.current.handleOpenFile(
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

      expect(readFile).toHaveBeenCalledWith(fileHandle);
      expect(editorState).toHaveBeenCalled();
      expect(tabState).toHaveBeenCalled();
    });

    it('skips loading text content for media files opened in image viewer', async () => {
      const readFile = vi.fn();
      const fs = makeFileSystemApi({ mode: 'local', readFile });
      const editorState = createMockEditorState({ fileContents: {} });
      const tabState = createMockTabState({ openTabs: [] });

      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs,
          editorState,
          tabState,
        }),
      );

      await result.current.handleOpenFile(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({
            name: 'photo.png',
            type: 'file',
            path: ['assets', 'photo.png'],
            handle: { name: 'photo.png' } as FileSystemFileHandle,
          }),
          path: ['assets', 'photo.png'],
          pathStr: 'assets/photo.png',
        }),
      );

      expect(readFile).not.toHaveBeenCalled();
      expect(editorState).not.toHaveBeenCalled();
    });

    it('loads media file text when opened in editor view', async () => {
      const readFile = vi.fn().mockResolvedValue('svg source');
      const fs = makeFileSystemApi({ mode: 'local', readFile });
      const editorState = createMockEditorState({ fileContents: {} });

      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs,
          editorState,
        }),
      );

      await result.current.handleOpenFile(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({
            name: 'icon.svg',
            type: 'file',
            path: ['assets', 'icon.svg'],
            handle: { name: 'icon.svg' } as FileSystemFileHandle,
          }),
          path: ['assets', 'icon.svg'],
          pathStr: 'assets/icon.svg',
        }),
        { viewType: FILE_VIEW_TYPES.EDITOR },
      );

      expect(readFile).toHaveBeenCalled();
      expect(editorState).toHaveBeenCalled();
    });

    it('updates an existing tab view type and content', async () => {
      const editorState = createMockEditorState({ fileContents: { 'src/App.js': 'updated' } });
      const tabState = createMockTabState({
        openTabs: [
          {
            id: 'src/App.js',
            label: 'App.js',
            type: 'file',
            viewType: FILE_VIEW_TYPES.EDITOR,
            file: { name: 'App.js', path: ['src', 'App.js'], content: 'old' },
          },
        ],
      });

      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          editorState,
          tabState,
        }),
      );

      await result.current.handleOpenFile(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['src', 'App.js'] }),
          path: ['src', 'App.js'],
          pathStr: 'src/App.js',
        }),
        { viewType: FILE_VIEW_TYPES.TOKEN_BREAKDOWN },
      );

      expect(tabState.openTabs).toHaveLength(1);
      expect(tabState.openTabs[0].viewType).toBe(FILE_VIEW_TYPES.TOKEN_BREAKDOWN);
      expect(tabState.openTabs[0].file?.content).toBe('updated');
    });

    it('closes the sidebar on mobile after opening a file', async () => {
      const sidebarState = makeSidebarState({ isSidebarOpen: true, expandedFolders: {} });
      const appState = makeAppState({ isMobile: true });

      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          appState,
          sidebarState,
        }),
      );

      await result.current.handleOpenFile(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['src', 'App.js'] }),
          path: ['src', 'App.js'],
          pathStr: 'src/App.js',
        }),
      );

      expect(sidebarState.isSidebarOpen).toBe(false);
    });
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
      const sidebarState = makeSidebarState({
        folderTree: [
          asNormalizedTreeNode({
            name: 'src',
            type: 'folder',
            path: ['src'],
            handle: parentHandle,
            children: [
              asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['src', 'App.js'] }),
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
          item: asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['src', 'App.js'] }),
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
      const sidebarState = makeSidebarState({
        folderTree: [
          asNormalizedTreeNode({
            name: 'src',
            type: 'folder',
            path: ['src'],
            handle: parentHandle,
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
          item: asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['src', 'App.js'] }),
          path: ['src', 'App.js'],
          pathStr: 'src/App.js',
        }),
      );

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(addNotification).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
