import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useSidebarFileLoader from './SidebarFileLoader';

describe('useSidebarFileLoader', () => {
  const defaultArgs = {
    fs: {
      mode: 'sandbox',
      triggerRefresh: vi.fn(),
      readFile: vi.fn().mockResolvedValue('file text'),
    },
    appState: { isMobile: false },
    sidebarState: vi.fn(),
    tabState: vi.fn(),
    editorState: Object.assign(vi.fn(), { fileContents: { 'src/App.js': 'code' } }),
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
    const appState = vi.fn();
    const addNotification = vi.fn();

    const { result } = renderHook(() =>
      useSidebarFileLoader({
        ...defaultArgs,
        appState: Object.assign(appState, { isMobile: false }),
        addNotification,
      }),
    );

    const res = await result.current.handleRename({ item: { isRoot: true } }, 'NewProject');
    expect(res).toBe(true);
    expect(appState).toHaveBeenCalled();
    expect(addNotification).toHaveBeenCalledWith('Renamed project to "NewProject"', 'success');
  });

  it('handles handleRename for non-root file in sandbox mode', async () => {
    const sidebarState = vi.fn((cb) => cb({ folderTree: [], expandedFolders: {} }));
    const editorState = Object.assign(
      vi.fn((cb) => cb({ fileContents: {} })),
      { fileContents: {} },
    );
    const tabState = vi.fn((cb) => cb({ openTabs: [{ id: 'src/App.js' }] }));

    const { result } = renderHook(() =>
      useSidebarFileLoader({
        ...defaultArgs,
        sidebarState,
        editorState,
        tabState,
      }),
    );

    const res = await result.current.handleRename(
      { item: { isRoot: false }, path: ['src', 'App.js'], pathStr: 'src/App.js' },
      'Main.js',
    );
    expect(res).toBe(true);
    expect(sidebarState).toHaveBeenCalled();
    expect(editorState).toHaveBeenCalled();
    expect(tabState).toHaveBeenCalled();
  });

  it('handles handleDelete for file', async () => {
    const sidebarState = vi.fn((cb) => cb({ folderTree: [] }));
    const editorState = Object.assign(
      vi.fn((cb) => cb({ fileContents: {} })),
      { fileContents: {} },
    );
    const tabState = vi.fn((cb) => cb({ openTabs: [{ id: 'src/App.js' }] }));
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

    await result.current.handleDelete({
      item: { name: 'App.js' },
      path: ['src', 'App.js'],
      pathStr: 'src/App.js',
    });
    expect(sidebarState).toHaveBeenCalled();
    expect(tabState).toHaveBeenCalled();
    expect(editorState).toHaveBeenCalled();
    expect(addNotification).toHaveBeenCalledWith('"App.js" deleted', 'info');
  });

  it('handles handleOpenFile in sandbox mode', async () => {
    const editorStateFn = vi.fn((cb) => cb({ fileContents: { 'src/App.js': 'code' } }));
    const editorState = Object.assign(editorStateFn, { fileContents: { 'src/App.js': 'code' } });
    const tabState = vi.fn((cb) => cb({ openTabs: [] }));
    const sidebarState = vi.fn((cb) => cb({ expandedFolders: {} }));

    const { result } = renderHook(() =>
      useSidebarFileLoader({
        ...defaultArgs,
        editorState,
        tabState,
        sidebarState,
      }),
    );

    await result.current.handleOpenFile({
      item: { name: 'App.js' },
      path: ['src', 'App.js'],
      pathStr: 'src/App.js',
    });

    expect(editorState).toHaveBeenCalled();
    expect(tabState).toHaveBeenCalled();
    expect(sidebarState).toHaveBeenCalled();
  });

  it('handles handleCreate in sandbox (non-local) mode', async () => {
    const sidebarState = vi.fn();
    const addNotification = vi.fn();

    const { result } = renderHook(() =>
      useSidebarFileLoader({
        ...defaultArgs,
        sidebarState,
        addNotification,
      }),
    );

    const success = await result.current.handleCreate({ path: ['src'] }, 'file', 'index.js');

    expect(success).toBe(true);
    expect(sidebarState).toHaveBeenCalled();
    expect(addNotification).toHaveBeenCalledWith('File "index.js" created', 'success');
  });

  it('handles handleCreate in local mode for files', async () => {
    const mockFileHandle = {
      createWritable: vi.fn().mockResolvedValue({
        close: vi.fn().mockResolvedValue(),
      }),
    };
    const mockDirHandle = {
      getFileHandle: vi.fn().mockResolvedValue(mockFileHandle),
    };
    const fs = { mode: 'local', triggerRefresh: vi.fn() };
    const addNotification = vi.fn();

    const { result } = renderHook(() =>
      useSidebarFileLoader({
        ...defaultArgs,
        fs,
        addNotification,
      }),
    );

    const success = await result.current.handleCreate(
      { item: { handle: mockDirHandle }, path: ['src'] },
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
    };
    const fs = { mode: 'local', triggerRefresh: vi.fn() };

    const { result } = renderHook(() =>
      useSidebarFileLoader({
        ...defaultArgs,
        fs,
      }),
    );

    const success = await result.current.handleCreate(
      { item: { handle: mockDirHandle }, path: ['src'] },
      'folder',
      'components',
    );

    expect(success).toBe(true);
    expect(mockDirHandle.getDirectoryHandle).toHaveBeenCalledWith('components', { create: true });
  });

  it('handles handleCreate error in local mode gracefully', async () => {
    const mockDirHandle = {
      getFileHandle: vi.fn().mockRejectedValue(new Error('Permission denied')),
    };
    const fs = { mode: 'local', triggerRefresh: vi.fn() };
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useSidebarFileLoader({
        ...defaultArgs,
        fs,
      }),
    );

    const success = await result.current.handleCreate(
      { item: { handle: mockDirHandle }, path: ['src'] },
      'file',
      'index.js',
    );

    expect(success).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
