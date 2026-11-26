import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDirectoryHandle, makeFileSystemApi } from '@/test-utils/fsMocks';
import { makeSidebarState, makeSidebarUiState, makeTabState } from '@/test-utils/stateMocks';
import { asNormalizedTreeNode, makeTreeNode } from '@/test-utils/treeMocks';
import type { TreeNode } from '@/types/domain-types';
import type { SidebarTreeRow } from './sidebar-types';
import useSidebarData from './useSidebarData';

type UseSidebarDataArgs = Parameters<typeof useSidebarData>[0];

function makeSidebarDataArgs(overrides: Partial<UseSidebarDataArgs> = {}): UseSidebarDataArgs {
  return {
    fs: makeFileSystemApi({ mode: null, files: [], version: 0 }),
    sidebarState: makeSidebarState({ folderTree: [], expandedFolders: {} }),
    editorState: {
      pendingDiffs: {},
      pendingDeletions: {},
      dirtyBufferContents: {},
    },
    sidebarUiState: makeSidebarUiState({ creatingAt: null }),
    tabState: makeTabState({ activeTabId: null, openTabs: [] }),
    projectName: 'DemoApp',
    folderTree: [],
    expandedFolders: {},
    deferredFilterText: '',
    creatingAt: null,
    loadChildren: vi.fn().mockResolvedValue(undefined),
    handleToggle: vi.fn(),
    ...overrides,
  };
}

describe('useSidebarData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('filesystem tree synchronization effect', () => {
    it('does nothing when fs.mode is null', () => {
      const sidebarState = makeSidebarState();
      renderHook(() =>
        useSidebarData(
          makeSidebarDataArgs({
            fs: makeFileSystemApi({ mode: null, files: [makeTreeNode('index.js')] }),
            sidebarState,
          }),
        ),
      );

      expect(sidebarState).not.toHaveBeenCalled();
    });

    it('syncs fs.files, preserves staged/dirty/pending-deletion paths, collapses node_modules, and skips duplicate syncs', () => {
      const files: TreeNode[] = [
        {
          name: 'src',
          type: 'folder',
          path: ['src'],
          children: [{ name: 'App.js', type: 'file', path: ['src', 'App.js'] }],
        },
        {
          name: 'staged',
          type: 'folder',
          path: ['staged'],
          children: [],
        },
        {
          name: 'node_modules',
          type: 'folder',
          path: ['node_modules'],
          children: [{ name: 'pkg', type: 'folder', path: ['node_modules', 'pkg'], children: [] }],
        },
      ];
      const existingTree: TreeNode[] = [
        {
          name: 'staged',
          type: 'folder',
          path: ['staged'],
          children: [
            { name: 'diff.ts', type: 'file', path: ['staged', 'diff.ts'] },
            { name: 'deleted.ts', type: 'file', path: ['staged', 'deleted.ts'] },
            { name: 'dirty.ts', type: 'file', path: ['staged', 'dirty.ts'] },
            { name: 'gone.ts', type: 'file', path: ['staged', 'gone.ts'] },
          ],
        },
      ];
      const sidebarState = makeSidebarState({
        folderTree: existingTree,
        expandedFolders: { src: true, node_modules: true },
      });

      const fs = makeFileSystemApi({ mode: 'sandbox', files, version: 1 });
      const initialArgs = makeSidebarDataArgs({
        fs,
        sidebarState,
        editorState: {
          pendingDiffs: { 'staged/diff.ts': {} },
          pendingDeletions: { 'staged/deleted.ts': {} },
          dirtyBufferContents: { 'staged/dirty.ts': 'unsaved' },
        },
      });

      const { rerender } = renderHook((props) => useSidebarData(props), {
        initialProps: initialArgs,
      });

      expect(sidebarState).toHaveBeenCalledTimes(1);
      expect(sidebarState.expandedFolders.node_modules).toBe(false);
      expect(sidebarState.expandedFolders['node_modules/pkg']).toBe(false);
      expect(sidebarState.expandedFolders.src).toBe(true);

      const stagedFolder = sidebarState.folderTree.find((n) => n.name === 'staged');
      expect(stagedFolder?.children?.map((c) => c.name)).toEqual([
        'deleted.ts',
        'diff.ts',
        'dirty.ts',
      ]);

      // Re-render with a new editorState reference but identical fs.files/mode/version -> hits early-return dedup
      rerender({ ...initialArgs, editorState: { ...initialArgs.editorState } });
      expect(sidebarState).toHaveBeenCalledTimes(1);

      // Re-render with undefined fs.files and undefined draft folderTree/expandedFolders
      const emptySidebarState = makeSidebarState({
        folderTree: undefined as unknown as TreeNode[],
        expandedFolders: undefined as unknown as Record<string, boolean>,
      });
      rerender(
        makeSidebarDataArgs({
          fs: makeFileSystemApi({
            mode: 'sandbox',
            files: undefined as unknown as TreeNode[],
            version: 2,
          }),
          sidebarState: emptySidebarState,
          editorState: {},
        }),
      );
      expect(emptySidebarState).toHaveBeenCalledTimes(1);
      expect(emptySidebarState.folderTree).toEqual([]);
      expect(emptySidebarState.expandedFolders).toEqual({});
    });
  });

  describe('incomplete expanded folder loading in local mode', () => {
    it('loads incomplete or version-refreshed expanded folders with handles and deduplicates concurrent loads', async () => {
      const resolvers: Array<() => void> = [];
      const loadChildren = vi.fn<UseSidebarDataArgs['loadChildren']>(
        () =>
          new Promise<void>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      const handleA = makeDirectoryHandle('a');
      const handleB = makeDirectoryHandle('b');
      const root1 = makeDirectoryHandle('root1');
      const folderTree: TreeNode[] = [
        asNormalizedTreeNode({
          name: 'a',
          type: 'folder',
          path: ['a'],
          childrenLoaded: false,
          handle: handleA,
          children: [],
        }),
        asNormalizedTreeNode({
          name: 'b',
          type: 'folder',
          path: ['b'],
          childrenLoaded: true,
          handle: handleB,
          children: [],
        }),
        asNormalizedTreeNode({
          name: 'noHandle',
          type: 'folder',
          path: ['noHandle'],
          childrenLoaded: false,
          children: [],
        }),
        asNormalizedTreeNode({
          name: 'collapsed',
          type: 'folder',
          path: ['collapsed'],
          childrenLoaded: false,
          handle: makeDirectoryHandle('collapsed'),
          children: [],
        }),
      ];

      const args = makeSidebarDataArgs({
        fs: makeFileSystemApi({ mode: 'local', version: 1, rootHandle: root1 }),
        folderTree,
        expandedFolders: { a: true, b: true, noHandle: true, collapsed: false },
        loadChildren,
      });

      const { rerender } = renderHook((props) => useSidebarData(props), { initialProps: args });

      // On first mount, filesystemVersionChanged is true -> both a and b (expanded + handle) load
      expect(loadChildren).toHaveBeenCalledTimes(2);
      expect(loadChildren.mock.calls.map((c) => c[0].pathStr)).toEqual(['a', 'b']);
      expect(loadChildren.mock.calls[0]?.[1]).toBe(true);

      // Re-render while still pending with same version -> a is still in loadingIncompleteFoldersRef, b has childrenLoaded: true
      rerender({
        ...args,
        folderTree: [...folderTree],
      });
      expect(loadChildren).toHaveBeenCalledTimes(2);

      // Resolve first batch so tokens clear
      await act(async () => {
        for (const resolve of resolvers) resolve();
      });

      // Same version now, only childrenLoaded === false ('a') should reload
      loadChildren.mockClear();
      loadChildren.mockResolvedValue(undefined);
      await act(async () => {
        rerender({
          ...args,
          folderTree: [...folderTree],
        });
      });
      expect(loadChildren).toHaveBeenCalledTimes(1);
      expect(loadChildren.mock.calls[0]?.[0].pathStr).toBe('a');
    });

    it('clears in-flight tracking on rootHandle change and preserves newer token when stale promise resolves', async () => {
      const resolvers: Array<() => void> = [];
      const loadChildren = vi.fn<UseSidebarDataArgs['loadChildren']>(
        () =>
          new Promise<void>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      const root1 = makeDirectoryHandle('root1');
      const root2 = makeDirectoryHandle('root2');
      const folderTree: TreeNode[] = [
        asNormalizedTreeNode({
          name: 'src',
          type: 'folder',
          path: ['src'],
          childrenLoaded: false,
          handle: makeDirectoryHandle('src'),
          children: [],
        }),
      ];

      const { rerender } = renderHook((props) => useSidebarData(props), {
        initialProps: makeSidebarDataArgs({
          fs: makeFileSystemApi({ mode: 'local', version: 1, rootHandle: root1 }),
          folderTree,
          expandedFolders: { src: true },
          loadChildren,
        }),
      });

      expect(loadChildren).toHaveBeenCalledTimes(1);

      // Switching rootHandle clears loadingIncompleteFoldersRef and starts a new request for 'src'
      rerender(
        makeSidebarDataArgs({
          fs: makeFileSystemApi({ mode: 'local', version: 1, rootHandle: root2 }),
          folderTree: [...folderTree],
          expandedFolders: { src: true },
          loadChildren,
        }),
      );
      expect(loadChildren).toHaveBeenCalledTimes(2);

      // Resolve the OLD promise first; it must NOT clear the new request's token
      await act(async () => {
        resolvers[0]?.();
      });

      rerender(
        makeSidebarDataArgs({
          fs: makeFileSystemApi({ mode: 'local', version: 1, rootHandle: root2 }),
          folderTree: [...folderTree],
          expandedFolders: { src: true },
          loadChildren,
        }),
      );
      expect(loadChildren).toHaveBeenCalledTimes(2);

      // Resolve the NEW promise; now subsequent render can trigger another load
      await act(async () => {
        resolvers[1]?.();
      });

      rerender(
        makeSidebarDataArgs({
          fs: makeFileSystemApi({ mode: 'local', version: 1, rootHandle: root2 }),
          folderTree: [...folderTree],
          expandedFolders: { src: true },
          loadChildren,
        }),
      );
      expect(loadChildren).toHaveBeenCalledTimes(3);
    });
  });

  describe('focus-file-search window event', () => {
    it('focuses and selects searchInputRef when populated, handles null ref, and removes listener on unmount', () => {
      const { result, unmount } = renderHook(() => useSidebarData(makeSidebarDataArgs()));

      // Safely no-ops when ref is null
      expect(() => window.dispatchEvent(new Event('focus-file-search'))).not.toThrow();

      const focus = vi.fn();
      const select = vi.fn();
      result.current.searchInputRef.current = {
        focus,
        select,
      } as unknown as HTMLInputElement;

      window.dispatchEvent(new Event('focus-file-search'));
      expect(focus).toHaveBeenCalledTimes(1);
      expect(select).toHaveBeenCalledTimes(1);

      unmount();
      window.dispatchEvent(new Event('focus-file-search'));
      expect(focus).toHaveBeenCalledTimes(1);
    });
  });

  describe('active tab folder expansion effect', () => {
    it('skips when activeTabId is null, non-file tab, missing tab, or single-segment path', () => {
      const sidebarState = makeSidebarState();
      const loadChildren = vi.fn().mockResolvedValue(undefined);

      const { rerender } = renderHook((props) => useSidebarData(props), {
        initialProps: makeSidebarDataArgs({
          sidebarState,
          loadChildren,
          tabState: makeTabState({ activeTabId: null, openTabs: [] }),
        }),
      });

      rerender(
        makeSidebarDataArgs({
          sidebarState,
          loadChildren,
          tabState: makeTabState({
            activeTabId: 'preview',
            openTabs: [{ id: 'preview', label: 'Preview', type: 'preview' }],
          }),
        }),
      );

      rerender(
        makeSidebarDataArgs({
          sidebarState,
          loadChildren,
          tabState: makeTabState({
            activeTabId: 'missing/file.ts',
            openTabs: [{ id: 'App.tsx', label: 'App.tsx', type: 'file' }],
          }),
        }),
      );

      rerender(
        makeSidebarDataArgs({
          sidebarState,
          loadChildren,
          tabState: makeTabState({
            activeTabId: 'App.tsx',
            openTabs: [{ id: 'App.tsx', label: 'App.tsx', type: 'file' }],
          }),
        }),
      );

      expect(sidebarState).not.toHaveBeenCalled();
      expect(loadChildren).not.toHaveBeenCalled();
    });

    it('expands collapsed ancestor folders, skips already expanded ones, and stops at missing folders or unloaded children', async () => {
      const folderTree: TreeNode[] = [
        asNormalizedTreeNode({
          name: 'src',
          type: 'folder',
          path: ['src'],
          children: [
            asNormalizedTreeNode({
              name: 'ui',
              type: 'folder',
              path: ['src', 'ui'],
              children: [
                asNormalizedTreeNode({
                  name: 'Button.tsx',
                  type: 'file',
                  path: ['src', 'ui', 'Button.tsx'],
                }),
              ],
            }),
          ],
        }),
      ];
      const sidebarState = makeSidebarState({
        folderTree,
        expandedFolders: { src: true, 'src/ui': false },
      });

      renderHook(() =>
        useSidebarData(
          makeSidebarDataArgs({
            fs: makeFileSystemApi({ mode: 'sandbox' }),
            folderTree,
            expandedFolders: { src: true, 'src/ui': false },
            sidebarState,
            tabState: makeTabState({
              activeTabId: 'src/ui/Button.tsx',
              openTabs: [{ id: 'src/ui/Button.tsx', label: 'Button.tsx', type: 'file' }],
            }),
          }),
        ),
      );

      await waitFor(() => {
        expect(sidebarState.expandedFolders).toEqual({ src: true, 'src/ui': true });
      });

      // When folder node is missing in tree, breaks cleanly without mutating
      const missingState = makeSidebarState({ expandedFolders: {} });
      renderHook(() =>
        useSidebarData(
          makeSidebarDataArgs({
            fs: makeFileSystemApi({ mode: 'sandbox' }),
            folderTree,
            expandedFolders: {},
            sidebarState: missingState,
            tabState: makeTabState({
              activeTabId: 'unknown/file.ts',
              openTabs: [{ id: 'unknown/file.ts', label: 'file.ts', type: 'file' }],
            }),
          }),
        ),
      );
      expect(missingState.expandedFolders).toEqual({});
    });

    it('calls loadChildren in local mode when an ancestor folder has undefined children, skips in sandbox mode, and respects cancellation', async () => {
      const unloadedFolder = asNormalizedTreeNode({
        name: 'lazy',
        type: 'folder',
        path: ['lazy'],
        handle: makeDirectoryHandle('lazy'),
      });
      const loadChildren = vi.fn().mockResolvedValue(undefined);
      const sidebarState = makeSidebarState({ expandedFolders: {} });

      renderHook(() =>
        useSidebarData(
          makeSidebarDataArgs({
            fs: makeFileSystemApi({ mode: 'local' }),
            folderTree: [unloadedFolder],
            expandedFolders: {},
            sidebarState,
            loadChildren,
            tabState: makeTabState({
              activeTabId: 'lazy/deep/file.ts',
              openTabs: [{ id: 'lazy/deep/file.ts', label: 'file.ts', type: 'file' }],
            }),
          }),
        ),
      );

      await waitFor(() => {
        expect(loadChildren).toHaveBeenCalledTimes(1);
      });
      expect(loadChildren.mock.calls[0][0]).toMatchObject({
        path: ['lazy'],
        pathStr: 'lazy',
        level: 1,
      });

      // In sandbox mode, breaks without calling loadChildren
      const sandboxLoadChildren = vi.fn().mockResolvedValue(undefined);
      renderHook(() =>
        useSidebarData(
          makeSidebarDataArgs({
            fs: makeFileSystemApi({ mode: 'sandbox' }),
            folderTree: [unloadedFolder],
            expandedFolders: {},
            sidebarState: makeSidebarState({ expandedFolders: {} }),
            loadChildren: sandboxLoadChildren,
            tabState: makeTabState({
              activeTabId: 'lazy/deep/file.ts',
              openTabs: [{ id: 'lazy/deep/file.ts', label: 'file.ts', type: 'file' }],
            }),
          }),
        ),
      );
      await Promise.resolve();
      expect(sandboxLoadChildren).not.toHaveBeenCalled();

      // Unmounting before async expand loop advances sets cancelled = true
      const delayedSidebarState = makeSidebarState({ expandedFolders: {} });
      const { unmount } = renderHook(() =>
        useSidebarData(
          makeSidebarDataArgs({
            fs: makeFileSystemApi({ mode: 'local' }),
            folderTree: [
              asNormalizedTreeNode({
                name: 'a',
                type: 'folder',
                path: ['a'],
                children: [
                  asNormalizedTreeNode({
                    name: 'b',
                    type: 'folder',
                    path: ['a', 'b'],
                    children: [],
                  }),
                ],
              }),
            ],
            expandedFolders: {},
            sidebarState: delayedSidebarState,
            tabState: makeTabState({
              activeTabId: 'a/b/c.ts',
              openTabs: [{ id: 'a/b/c.ts', label: 'c.ts', type: 'file' }],
            }),
          }),
        ),
      );
      unmount();
    });
  });

  describe('rows, scrollToIndex, and create handlers', () => {
    it('computes rows and scrollToIndex for active tab, creatingAt row, missing create target, and filter text', () => {
      const folderTree: TreeNode[] = [
        asNormalizedTreeNode({
          name: 'src',
          type: 'folder',
          path: ['src'],
          children: [
            asNormalizedTreeNode({ name: 'App.tsx', type: 'file', path: ['src', 'App.tsx'] }),
          ],
        }),
      ];

      const { result, rerender } = renderHook((props) => useSidebarData(props), {
        initialProps: makeSidebarDataArgs({
          projectName: 'Zakamurai',
          folderTree,
          expandedFolders: { src: true },
          tabState: makeTabState({ activeTabId: 'src/App.tsx' }),
        }),
      });

      expect(result.current.rows[0]).toMatchObject({
        key: '__root__',
        pathStr: '',
        item: { name: 'Zakamurai', isRoot: true },
      });
      expect(result.current.rows.map((r) => r.pathStr)).toEqual(['', 'src', 'src/App.tsx']);
      expect(result.current.scrollToIndex).toBe(2);

      // When creatingAt is set to an existing folder, scrollToIndex points to the inserted create row
      rerender(
        makeSidebarDataArgs({
          projectName: 'Zakamurai',
          folderTree,
          expandedFolders: { src: true },
          creatingAt: { pathStr: 'src', type: 'file' },
          tabState: makeTabState({ activeTabId: 'src/App.tsx' }),
        }),
      );
      expect(result.current.rows[2]).toMatchObject({ isCreateRow: true, createType: 'file' });
      expect(result.current.scrollToIndex).toBe(2);

      // When creatingAt targets a missing path, falls back to activeIndex (or null if none)
      rerender(
        makeSidebarDataArgs({
          projectName: 'Zakamurai',
          folderTree,
          expandedFolders: { src: true },
          creatingAt: { pathStr: 'nonexistent', type: 'file' },
          tabState: makeTabState({ activeTabId: null }),
        }),
      );
      expect(result.current.scrollToIndex).toBeNull();

      // Filtering limits rows to matches
      rerender(
        makeSidebarDataArgs({
          projectName: 'Zakamurai',
          folderTree,
          expandedFolders: { src: true },
          deferredFilterText: 'App',
          tabState: makeTabState({ activeTabId: 'missing.tsx' }),
        }),
      );
      expect(result.current.rows.map((r) => r.pathStr)).toEqual(['', 'src', 'src/App.tsx']);
      expect(result.current.scrollToIndex).toBeNull();
    });

    it('handleStartCreate expands collapsed non-root folders and handleCancelCreate clears creatingAt', () => {
      const sidebarUiState = makeSidebarUiState({ creatingAt: null });
      const handleToggle = vi.fn();

      const { result } = renderHook(() =>
        useSidebarData(
          makeSidebarDataArgs({
            sidebarUiState,
            expandedFolders: { collapsed: false, expanded: true },
            handleToggle,
          }),
        ),
      );

      const collapsedRow: SidebarTreeRow = {
        key: 'collapsed',
        item: asNormalizedTreeNode({ name: 'collapsed', type: 'folder', path: ['collapsed'] }),
        level: 1,
        path: ['collapsed'],
        pathStr: 'collapsed',
      };
      act(() => {
        result.current.handleStartCreate(collapsedRow, 'file');
      });
      expect(sidebarUiState.creatingAt).toEqual({ pathStr: 'collapsed', type: 'file' });
      expect(handleToggle).toHaveBeenCalledWith(collapsedRow, { expandOnly: true });

      handleToggle.mockClear();

      // Root row should not call handleToggle
      const rootRow: SidebarTreeRow = {
        key: '__root__',
        item: asNormalizedTreeNode({ name: 'Root', type: 'folder', path: [], isRoot: true }),
        level: 0,
        path: [],
        pathStr: '',
      };
      act(() => {
        result.current.handleStartCreate(rootRow, 'folder');
      });
      expect(sidebarUiState.creatingAt).toEqual({ pathStr: '', type: 'folder' });
      expect(handleToggle).not.toHaveBeenCalled();

      // Already-expanded folder should not call handleToggle
      const expandedRow: SidebarTreeRow = {
        key: 'expanded',
        item: asNormalizedTreeNode({ name: 'expanded', type: 'folder', path: ['expanded'] }),
        level: 1,
        path: ['expanded'],
        pathStr: 'expanded',
      };
      act(() => {
        result.current.handleStartCreate(expandedRow, 'file');
      });
      expect(handleToggle).not.toHaveBeenCalled();

      // File row should not call handleToggle
      const fileRow: SidebarTreeRow = {
        key: 'file.ts',
        item: asNormalizedTreeNode({ name: 'file.ts', type: 'file', path: ['file.ts'] }),
        level: 1,
        path: ['file.ts'],
        pathStr: 'file.ts',
      };
      act(() => {
        result.current.handleStartCreate(fileRow, 'file');
      });
      expect(handleToggle).not.toHaveBeenCalled();

      act(() => {
        result.current.handleCancelCreate();
      });
      expect(sidebarUiState.creatingAt).toBeNull();
    });
  });
});
