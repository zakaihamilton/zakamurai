import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useSidebarDragAndDrop from './SidebarDragAndDrop';

describe('useSidebarDragAndDrop', () => {
  const defaultArgs = {
    fs: { mode: 'sandbox', moveEntry: vi.fn() },
    sidebarState: vi.fn(),
    setDropTargetPath: vi.fn(),
  };

  it('initializes correctly and returns standard drag handlers', () => {
    const { result } = renderHook(() => useSidebarDragAndDrop(defaultArgs));

    expect(result.current.handleDragStart).toBeTypeOf('function');
    expect(result.current.handleDragOver).toBeTypeOf('function');
    expect(result.current.handleDragEnter).toBeTypeOf('function');
    expect(result.current.handleDrop).toBeTypeOf('function');
  });

  it('handleDragStart prevents default on root item', () => {
    const { result } = renderHook(() => useSidebarDragAndDrop(defaultArgs));
    const event = { preventDefault: vi.fn() };
    const row = { item: { isRoot: true } };

    result.current.handleDragStart(event, row);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('handleDragStart sets data and updates sidebarState on non-root item', () => {
    const sidebarState = vi.fn();
    const { result } = renderHook(() =>
      useSidebarDragAndDrop({
        ...defaultArgs,
        sidebarState,
      })
    );

    const event = {
      preventDefault: vi.fn(),
      dataTransfer: { effectAllowed: '', setData: vi.fn() },
    };
    const row = {
      path: ['src', 'App.js'],
      pathStr: 'src/App.js',
      item: { isRoot: false, type: 'file', handle: {}, name: 'App.js' },
    };

    result.current.handleDragStart(event, row);
    expect(sidebarState).toHaveBeenCalled();
    expect(event.dataTransfer.effectAllowed).toBe('move');
    expect(event.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'src/App.js');
  });

  it('handleDragOver prevents default and sets dropEffect for valid folders', () => {
    const sidebarState = vi.fn();
    sidebarState.draggedItem = { path: ['src', 'App.js'] };

    const { result } = renderHook(() =>
      useSidebarDragAndDrop({
        ...defaultArgs,
        sidebarState,
      })
    );

    const event = {
      preventDefault: vi.fn(),
      dataTransfer: { dropEffect: '' },
    };
    const row = {
      path: ['components'],
      pathStr: 'components',
      item: { type: 'folder' },
    };

    result.current.handleDragOver(event, row);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.dataTransfer.dropEffect).toBe('move');
  });

  it('handleDragEnter sets drop target path for valid folder targets', () => {
    const sidebarState = vi.fn();
    sidebarState.draggedItem = { path: ['src', 'App.js'] };
    const setDropTargetPath = vi.fn();

    const { result } = renderHook(() =>
      useSidebarDragAndDrop({
        ...defaultArgs,
        sidebarState,
        setDropTargetPath,
      })
    );

    const row = {
      path: ['components'],
      pathStr: 'components',
      item: { type: 'folder' },
    };

    result.current.handleDragEnter({}, row);
    expect(setDropTargetPath).toHaveBeenCalledWith('components');
  });

  it('handleDrop supports local mode and updates expanded folders', async () => {
    const sidebarState = vi.fn();
    sidebarState.draggedItem = {
      path: ['src', 'App.js'],
      name: 'App.js',
      handle: 'srcHandle',
    };
    const setDropTargetPath = vi.fn();
    const fs = { mode: 'local', moveEntry: vi.fn().mockResolvedValue() };

    const { result } = renderHook(() =>
      useSidebarDragAndDrop({
        ...defaultArgs,
        fs,
        sidebarState,
        setDropTargetPath,
      })
    );

    const event = { preventDefault: vi.fn() };
    const row = {
      path: ['components'],
      pathStr: 'components',
      item: { type: 'folder', handle: 'destHandle' },
    };

    await result.current.handleDrop(event, row);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(setDropTargetPath).toHaveBeenCalledWith(null);
    expect(fs.moveEntry).toHaveBeenCalledWith('srcHandle', 'destHandle');
    expect(sidebarState).toHaveBeenCalled();
  });
});
