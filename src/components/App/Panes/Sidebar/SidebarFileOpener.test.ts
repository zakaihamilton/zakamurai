import { createMockEditorState, createMockTabState } from '@/test-utils/editorMocks';
import { makeFileSystemApi } from '@/test-utils/fsMocks';
import { makeAppState } from '@/test-utils/stateMocks';
import { asNormalizedTreeNode, makeFlatTreeRow } from '@/test-utils/treeMocks';
import { FILE_VIEW_TYPES } from '@/utils/fileViews';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useSidebarFileLoader from './SidebarFileLoader';
import { makeSidebarLoaderDefaultArgs, makeSidebarStateForFile } from './sidebarTestFixtures';

describe('useSidebarFileLoader — handleOpenFile', () => {
  let defaultArgs: ReturnType<typeof makeSidebarLoaderDefaultArgs>;

  beforeEach(() => {
    defaultArgs = makeSidebarLoaderDefaultArgs();
  });

  it('handles handleOpenFile in sandbox mode', async () => {
    const editorState = createMockEditorState({ fileContents: { 'src/App.js': 'code' } });
    const tabState = createMockTabState({ openTabs: [] });
    const sidebarState = makeSidebarStateForFile(['src', 'App.js']);

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

  describe('handleOpenFile', () => {
    it('refreshes clean cached local files from disk when reopened', async () => {
      const readFile = vi.fn().mockResolvedValue('fresh disk content');
      const fileHandle = { name: 'App.js' } as FileSystemFileHandle;
      const fs = makeFileSystemApi({ mode: 'local', readFile });
      const editorState = createMockEditorState({
        fileContents: { 'src/App.js': 'stale cached content' },
      });
      const tabState = createMockTabState({ openTabs: [] });
      const sidebarState = makeSidebarStateForFile(['src', 'App.js'], fileHandle);

      const { result } = renderHook(() =>
        useSidebarFileLoader({ ...defaultArgs, fs, editorState, tabState, sidebarState }),
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
      expect(editorState.fileContents['src/App.js']).toBe('fresh disk content');
      expect(tabState.openTabs[0].file?.content).toBe('fresh disk content');
    });

    it('loads media file text for token breakdown view', async () => {
      const readFile = vi.fn().mockResolvedValue('svg source');
      const fs = makeFileSystemApi({ mode: 'local', readFile });
      const editorState = createMockEditorState({ fileContents: {} });
      const fileHandle = { name: 'photo.png' } as FileSystemFileHandle;
      const sidebarState = makeSidebarStateForFile(['assets', 'photo.png'], fileHandle);

      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs,
          editorState,
          sidebarState,
        }),
      );

      await result.current.handleOpenFile(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({
            name: 'photo.png',
            type: 'file',
            path: ['assets', 'photo.png'],
            handle: fileHandle,
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
      const sidebarState = makeSidebarStateForFile(['src', 'App.js'], fileHandle);

      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs,
          editorState,
          tabState,
          sidebarState,
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
      const fileHandle = { name: 'photo.png' } as FileSystemFileHandle;
      const sidebarState = makeSidebarStateForFile(['assets', 'photo.png'], fileHandle);

      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs,
          editorState,
          tabState,
          sidebarState,
        }),
      );

      await result.current.handleOpenFile(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({
            name: 'photo.png',
            type: 'file',
            path: ['assets', 'photo.png'],
            handle: fileHandle,
          }),
          path: ['assets', 'photo.png'],
          pathStr: 'assets/photo.png',
        }),
      );

      expect(readFile).not.toHaveBeenCalled();
      expect(editorState).not.toHaveBeenCalled();
      expect(tabState).toHaveBeenCalled();
    });

    it('loads media file text when opened in editor view', async () => {
      const readFile = vi.fn().mockResolvedValue('svg source');
      const fs = makeFileSystemApi({ mode: 'local', readFile });
      const editorState = createMockEditorState({ fileContents: {} });
      const fileHandle = { name: 'icon.svg' } as FileSystemFileHandle;
      const sidebarState = makeSidebarStateForFile(['assets', 'icon.svg'], fileHandle);

      const { result } = renderHook(() =>
        useSidebarFileLoader({
          ...defaultArgs,
          fs,
          editorState,
          sidebarState,
        }),
      );

      await result.current.handleOpenFile(
        makeFlatTreeRow({
          item: asNormalizedTreeNode({
            name: 'icon.svg',
            type: 'file',
            path: ['assets', 'icon.svg'],
            handle: fileHandle,
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
      const sidebarState = makeSidebarStateForFile(['src', 'App.js']);

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
        { viewType: FILE_VIEW_TYPES.TOKEN_BREAKDOWN },
      );

      expect(tabState.openTabs).toHaveLength(1);
      expect(tabState.openTabs[0].viewType).toBe(FILE_VIEW_TYPES.TOKEN_BREAKDOWN);
      expect(tabState.openTabs[0].file?.content).toBe('updated');
    });

    it('closes the sidebar on mobile after opening a file', async () => {
      const sidebarState = makeSidebarStateForFile(['src', 'App.js']);
      sidebarState.isSidebarOpen = true;
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
});
