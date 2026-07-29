import { mockDragEvent } from '@/test-utils/domMocks';
import { makeDirectoryHandle, makeFileHandle, makeFileSystemApi } from '@/test-utils/fsMocks';
import { makeSidebarState } from '@/test-utils/stateMocks';
import { asNormalizedTreeNode, makeFlatTreeRow } from '@/test-utils/treeMocks';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useSidebarDragAndDrop from './SidebarDragAndDrop';

describe('useSidebarDragAndDrop', () => {
  const defaultArgs = {
    fs: makeFileSystemApi({ mode: 'sandbox', moveEntry: vi.fn() }),
    sidebarState: makeSidebarState(),
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
    const event = mockDragEvent();
    const row = makeFlatTreeRow({
      item: asNormalizedTreeNode({ name: 'root', type: 'folder', path: [], isRoot: true }),
    });

    result.current.handleDragStart(event, row);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('handleDragStart sets data and updates sidebarState on non-root item', () => {
    const sidebarState = makeSidebarState();
    const { result } = renderHook(() =>
      useSidebarDragAndDrop({
        ...defaultArgs,
        sidebarState,
      }),
    );

    const setData = vi.fn();
    const event = mockDragEvent({
      dataTransfer: { effectAllowed: 'all', setData },
    });
    const row = makeFlatTreeRow({
      path: ['src', 'App.js'],
      pathStr: 'src/App.js',
      item: asNormalizedTreeNode({
        name: 'App.js',
        type: 'file',
        path: ['src', 'App.js'],
        handle: {} as FileSystemFileHandle,
      }),
    });

    result.current.handleDragStart(event, row);
    expect(sidebarState).toHaveBeenCalled();
    expect(event.dataTransfer?.effectAllowed).toBe('move');
    expect(setData).toHaveBeenCalledWith('text/plain', 'src/App.js');
  });

  it('handleDragOver prevents default and sets dropEffect for valid folders', () => {
    const sidebarState = makeSidebarState();
    sidebarState.draggedItem = { path: ['src', 'App.js'] } as never;

    const { result } = renderHook(() =>
      useSidebarDragAndDrop({
        ...defaultArgs,
        sidebarState,
      }),
    );

    const event = mockDragEvent({ dataTransfer: { dropEffect: 'none' } });
    const row = makeFlatTreeRow({
      path: ['components'],
      pathStr: 'components',
      item: asNormalizedTreeNode({ name: 'components', type: 'folder', path: ['components'] }),
    });

    result.current.handleDragOver(event, row);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.dataTransfer?.dropEffect).toBe('move');
  });

  it('handleDragEnter sets drop target path for valid folder targets', () => {
    const sidebarState = makeSidebarState();
    sidebarState.draggedItem = { path: ['src', 'App.js'] } as never;
    const setDropTargetPath = vi.fn();

    const { result } = renderHook(() =>
      useSidebarDragAndDrop({
        ...defaultArgs,
        sidebarState,
        setDropTargetPath,
      }),
    );

    const row = makeFlatTreeRow({
      path: ['components'],
      pathStr: 'components',
      item: asNormalizedTreeNode({ name: 'components', type: 'folder', path: ['components'] }),
    });

    result.current.handleDragEnter(mockDragEvent(), row);
    expect(setDropTargetPath).toHaveBeenCalledWith('components');
  });

  it('handleDrop supports local mode and updates expanded folders', async () => {
    const sidebarState = makeSidebarState();
    sidebarState.draggedItem = {
      path: ['src', 'App.js'],
      name: 'App.js',
      handle: makeFileHandle('App.js'),
    } as never;
    const setDropTargetPath = vi.fn();
    const fs = makeFileSystemApi({
      mode: 'local',
      moveEntry: vi.fn().mockResolvedValue(undefined),
    });

    const { result } = renderHook(() =>
      useSidebarDragAndDrop({
        ...defaultArgs,
        fs,
        sidebarState,
        setDropTargetPath,
      }),
    );

    const event = mockDragEvent();
    const row = makeFlatTreeRow({
      path: ['components'],
      pathStr: 'components',
      item: asNormalizedTreeNode({
        name: 'components',
        type: 'folder',
        path: ['components'],
        handle: makeDirectoryHandle('components'),
      }),
    });

    await result.current.handleDrop(event, row);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(setDropTargetPath).toHaveBeenCalledWith(null);
    expect(fs.moveEntry).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'file' }),
      expect.objectContaining({ kind: 'directory' }),
    );
    expect(sidebarState).toHaveBeenCalled();
  });
});
