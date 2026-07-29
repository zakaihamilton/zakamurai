import { createMockEditorState, createMockTabState } from '@/test-utils/editorMocks';
import { makeFileSystemApi } from '@/test-utils/fsMocks';
import { makeAppState, makeSidebarState } from '@/test-utils/stateMocks';
import { asNormalizedTreeNode, makeFlatTreeRow } from '@/test-utils/treeMocks';
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
});
