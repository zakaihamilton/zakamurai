import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useSidebarFileLoader from './SidebarFileLoader';

describe('useSidebarFileLoader', () => {
  const defaultArgs = {
    fs: { mode: 'sandbox', triggerRefresh: vi.fn() },
    appState: { isMobile: false },
    sidebarState: vi.fn(),
    tabState: vi.fn(),
    editorState: vi.fn(),
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
