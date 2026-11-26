import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockEditorState, createMockTabState } from '@/test-utils/editorMocks';
import { makeFileSystemApi } from '@/test-utils/fsMocks';
import { makeAppState, makeChangeSetState, makeSidebarState } from '@/test-utils/stateMocks';
import { asNormalizedTreeNode, makeFlatTreeRow } from '@/test-utils/treeMocks';
import type { SidebarRow, WorkspaceSnapshot } from './useSidebarDirectoryLoader';
import { useSidebarTreeMutations } from './useSidebarTreeMutations';

function makeWorkspaceSnapshot(overrides: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    rootHandle: null,
    mode: 'sandbox',
    epoch: 0,
    ...overrides,
  };
}

function makeMutationsArgs(overrides: Partial<Parameters<typeof useSidebarTreeMutations>[0]> = {}) {
  return {
    fs: makeFileSystemApi({ mode: 'sandbox', triggerRefresh: vi.fn() }),
    appState: makeAppState({ isMobile: false }),
    sidebarState: makeSidebarState({ folderTree: [], expandedFolders: {} }),
    tabState: createMockTabState(),
    editorState: createMockEditorState({ fileContents: {} }),
    changeSetState: makeChangeSetState(),
    addNotification: vi.fn(),
    captureWorkspace: vi.fn(() => makeWorkspaceSnapshot()),
    isCurrentWorkspace: vi.fn(() => true),
    loadChildren: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeRow(overrides: Partial<SidebarRow> & { item: SidebarRow['item'] }): SidebarRow {
  return makeFlatTreeRow(overrides) as SidebarRow;
}

describe('useSidebarTreeMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleRename', () => {
    it('renames the root project and notifies success', async () => {
      const appState = makeAppState({ projectName: 'OldProject' });
      const addNotification = vi.fn();
      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ appState, addNotification })),
      );

      const renamed = await result.current.handleRename(
        makeRow({
          item: asNormalizedTreeNode({
            name: 'OldProject',
            type: 'folder',
            path: [],
            isRoot: true,
          }),
          path: [],
          pathStr: '',
        }),
        'NewProject',
      );

      expect(renamed).toBe(true);
      expect(appState.projectName).toBe('NewProject');
      expect(addNotification).toHaveBeenCalledWith('Renamed project to "NewProject"', 'success');
    });

    it('rejects invalid entry names', async () => {
      const addNotification = vi.fn();
      const sidebarState = makeSidebarState();
      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ sidebarState, addNotification })),
      );

      const renamed = await result.current.handleRename(
        makeRow({
          item: asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['src', 'App.js'] }),
        }),
        'bad/name',
      );

      expect(renamed).toBe(false);
      expect(addNotification).toHaveBeenCalledWith(
        'Use a valid file or folder name without path separators.',
        'error',
      );
      expect(sidebarState).not.toHaveBeenCalled();
    });

    it('returns true immediately when nextName matches the existing name', async () => {
      const sidebarState = makeSidebarState();
      const addNotification = vi.fn();
      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ sidebarState, addNotification })),
      );

      const renamed = await result.current.handleRename(
        makeRow({
          item: asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['App.js'] }),
        }),
        'App.js',
      );

      expect(renamed).toBe(true);
      expect(sidebarState).not.toHaveBeenCalled();
      expect(addNotification).not.toHaveBeenCalled();
    });

    it('rejects duplicate sibling names at both root level and nested folder level', async () => {
      const addNotification = vi.fn();
      const sidebarState = makeSidebarState({
        folderTree: [
          asNormalizedTreeNode({
            name: 'src',
            type: 'folder',
            path: ['src'],
            children: [
              asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['src', 'App.js'] }),
              asNormalizedTreeNode({ name: 'Main.js', type: 'file', path: ['src', 'Main.js'] }),
            ],
          }),
          asNormalizedTreeNode({ name: 'README.md', type: 'file', path: ['README.md'] }),
          asNormalizedTreeNode({ name: 'package.json', type: 'file', path: ['package.json'] }),
        ],
      });

      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ sidebarState, addNotification })),
      );

      const nestedDup = await result.current.handleRename(
        makeRow({
          item: asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['src', 'App.js'] }),
        }),
        'Main.js',
      );
      expect(nestedDup).toBe(false);
      expect(addNotification).toHaveBeenCalledWith(
        'An item named "Main.js" already exists here.',
        'error',
      );

      const rootDup = await result.current.handleRename(
        makeRow({
          item: asNormalizedTreeNode({ name: 'README.md', type: 'file', path: ['README.md'] }),
        }),
        'package.json',
      );
      expect(rootDup).toBe(false);
    });

    it('handles missing parent node during nested sibling lookup without crashing', async () => {
      const sidebarState = makeSidebarState({ folderTree: [] });
      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ sidebarState })),
      );

      const renamed = await result.current.handleRename(
        makeRow({
          item: asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['missing', 'App.js'] }),
        }),
        'Main.js',
      );

      expect(renamed).toBe(true);
    });

    it('returns false in local mode when item handle is missing', async () => {
      const addNotification = vi.fn();
      const fs = makeFileSystemApi({ mode: 'local' });
      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ fs, addNotification })),
      );

      const renamed = await result.current.handleRename(
        makeRow({
          item: asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['App.js'] }),
        }),
        'Main.js',
      );

      expect(renamed).toBe(false);
      expect(addNotification).toHaveBeenCalledWith(
        'The item is no longer available in the mounted project.',
        'error',
      );
    });

    it('renames via local move(), triggers refresh, and updates state when workspace stays current', async () => {
      const move = vi.fn().mockResolvedValue(undefined);
      const triggerRefresh = vi.fn();
      const fs = makeFileSystemApi({ mode: 'local', triggerRefresh });
      const sidebarState = makeSidebarState({
        folderTree: [asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['App.js'] })],
      });
      const addNotification = vi.fn();

      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ fs, sidebarState, addNotification })),
      );

      const renamed = await result.current.handleRename(
        makeRow({
          item: asNormalizedTreeNode({
            name: 'App.js',
            type: 'file',
            path: ['App.js'],
            handle: { move } as unknown as FileSystemFileHandle,
          }),
          path: ['App.js'],
          pathStr: 'App.js',
        }),
        'Main.js',
      );

      expect(renamed).toBe(true);
      expect(move).toHaveBeenCalledWith('Main.js');
      expect(triggerRefresh).toHaveBeenCalledTimes(1);
      expect(addNotification).toHaveBeenCalledWith('Renamed to "Main.js"', 'success');
    });

    it('aborts local rename without refresh or state mutations when workspace changes during move()', async () => {
      const move = vi.fn().mockResolvedValue(undefined);
      const triggerRefresh = vi.fn();
      const fs = makeFileSystemApi({ mode: 'local', triggerRefresh });
      const sidebarState = makeSidebarState();
      const isCurrentWorkspace = vi.fn(() => false);

      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ fs, sidebarState, isCurrentWorkspace })),
      );

      const renamed = await result.current.handleRename(
        makeRow({
          item: asNormalizedTreeNode({
            name: 'App.js',
            type: 'file',
            path: ['App.js'],
            handle: { move } as unknown as FileSystemFileHandle,
          }),
        }),
        'Main.js',
      );

      expect(renamed).toBe(false);
      expect(move).toHaveBeenCalledWith('Main.js');
      expect(triggerRefresh).not.toHaveBeenCalled();
      expect(sidebarState).not.toHaveBeenCalled();
    });

    it('handles local move() errors for both Error and non-Error rejections and ignores stale workspace errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const addNotification = vi.fn();
      const fs = makeFileSystemApi({ mode: 'local', triggerRefresh: vi.fn() });
      const isCurrentWorkspace = vi.fn(() => true);

      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ fs, addNotification, isCurrentWorkspace })),
      );

      const noMove = await result.current.handleRename(
        makeRow({
          item: asNormalizedTreeNode({
            name: 'App.js',
            type: 'file',
            path: ['App.js'],
            handle: {} as FileSystemFileHandle,
          }),
        }),
        'Main.js',
      );
      expect(noMove).toBe(false);
      expect(addNotification).toHaveBeenCalledWith(
        'Could not rename "App.js": Rename is not supported by this browser.',
        'error',
      );

      const nonErrorReject = await result.current.handleRename(
        makeRow({
          item: asNormalizedTreeNode({
            name: 'App.js',
            type: 'file',
            path: ['App.js'],
            handle: {
              move: vi.fn().mockRejectedValue('disk locked'),
            } as unknown as FileSystemFileHandle,
          }),
        }),
        'Main.js',
      );
      expect(nonErrorReject).toBe(false);
      expect(addNotification).toHaveBeenCalledWith(
        'Could not rename "App.js": disk locked',
        'error',
      );

      addNotification.mockClear();
      isCurrentWorkspace.mockReturnValue(false);
      const staleError = await result.current.handleRename(
        makeRow({
          item: asNormalizedTreeNode({
            name: 'App.js',
            type: 'file',
            path: ['App.js'],
            handle: {
              move: vi.fn().mockRejectedValue(new Error('boom')),
            } as unknown as FileSystemFileHandle,
          }),
        }),
        'Main.js',
      );
      expect(staleError).toBe(false);
      expect(addNotification).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });

    it('aborts sandbox rename if workspace is no longer current', async () => {
      const sidebarState = makeSidebarState();
      const isCurrentWorkspace = vi.fn(() => false);
      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ sidebarState, isCurrentWorkspace })),
      );

      const renamed = await result.current.handleRename(
        makeRow({
          item: asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['App.js'] }),
        }),
        'Main.js',
      );

      expect(renamed).toBe(false);
      expect(sidebarState).not.toHaveBeenCalled();
    });

    it('remaps expandedFolders, openTabs (including sourceFilePath, file, and unrelated tabs), activeTabId, editorState, and changeSetState', async () => {
      const sidebarState = makeSidebarState({
        folderTree: [
          asNormalizedTreeNode({
            name: 'src',
            type: 'folder',
            path: ['src'],
            children: [
              asNormalizedTreeNode({
                name: 'sub',
                type: 'folder',
                path: ['src', 'sub'],
                children: [
                  asNormalizedTreeNode({
                    name: 'Button.tsx',
                    type: 'file',
                    path: ['src', 'sub', 'Button.tsx'],
                  }),
                ],
              }),
            ],
          }),
        ],
        expandedFolders: {
          src: true,
          'src/sub': true,
          other: false,
        },
      });
      const tabState = createMockTabState({
        openTabs: [
          {
            id: 'src',
            label: 'src',
            type: 'file',
            sourceFilePath: 'src',
            file: { name: 'src', path: ['src'] },
          },
          {
            id: 'src/sub/Button.tsx',
            label: 'Button.tsx',
            type: 'file',
            sourceFilePath: 'src/sub/Button.tsx',
            file: { name: 'Button.tsx', path: ['src', 'sub', 'Button.tsx'] },
          },
          {
            id: 'logs:Button.tsx',
            label: 'Logs',
            type: 'logs',
            sourceFilePath: 'other/File.tsx',
          },
          {
            id: 'preview',
            label: 'Preview',
            type: 'preview',
          },
        ],
        activeTabId: 'src',
        lastCodeTabId: 'src/sub/Button.tsx',
      });
      const editorState = createMockEditorState({
        fileContents: { 'src/sub/Button.tsx': 'export const B = 1;' },
      });
      const changeSetState = makeChangeSetState({
        items: [
          {
            id: 'cs-1',
            request: 'edit',
            status: 'pending-review',
            createdAt: 1,
            files: [{ path: 'src/sub/Button.tsx', originalContent: '', proposedContent: 'x' }],
          },
        ],
      });
      const addNotification = vi.fn();

      const { result } = renderHook(() =>
        useSidebarTreeMutations(
          makeMutationsArgs({
            sidebarState,
            tabState,
            editorState,
            changeSetState,
            addNotification,
          }),
        ),
      );

      const renamed = await result.current.handleRename(
        makeRow({
          item: asNormalizedTreeNode({ name: 'src', type: 'folder', path: ['src'] }),
          path: ['src'],
          pathStr: 'src',
        }),
        'app',
      );

      expect(renamed).toBe(true);
      expect(sidebarState.expandedFolders).toEqual({
        app: true,
        'app/sub': true,
        other: false,
      });
      expect(tabState.openTabs[0]).toMatchObject({
        id: 'app',
        label: 'app',
        sourceFilePath: 'app',
        file: { name: 'app', path: ['app'] },
      });
      expect(tabState.openTabs[1]).toMatchObject({
        id: 'app/sub/Button.tsx',
        label: 'Button.tsx',
        sourceFilePath: 'app/sub/Button.tsx',
        file: { name: 'Button.tsx', path: ['app', 'sub', 'Button.tsx'] },
      });
      expect(tabState.openTabs[2]).toMatchObject({
        id: 'logs:Button.tsx',
        sourceFilePath: 'other/File.tsx',
      });
      expect(tabState.openTabs[3]).toEqual({ id: 'preview', label: 'Preview', type: 'preview' });
      expect(tabState.activeTabId).toBe('app');
      expect(tabState.lastCodeTabId).toBe('app/sub/Button.tsx');
      expect(editorState.fileContents['app/sub/Button.tsx']).toBe('export const B = 1;');
      expect(changeSetState.items[0].files[0].path).toBe('app/sub/Button.tsx');
      expect(addNotification).toHaveBeenCalledWith('Renamed to "app"', 'success');
    });

    it('handles undefined openTabs and empty folderTree safely during rename', async () => {
      const sidebarState = makeSidebarState({ folderTree: [] });
      const tabState = createMockTabState({
        openTabs: undefined as unknown as [],
        activeTabId: 'unrelated.ts',
      });
      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ sidebarState, tabState })),
      );

      const renamed = await result.current.handleRename(
        makeRow({
          item: asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['App.js'] }),
          path: ['App.js'],
          pathStr: 'App.js',
        }),
        'Main.js',
      );

      expect(renamed).toBe(true);
      expect(tabState.openTabs).toEqual([]);
      expect(tabState.activeTabId).toBe('unrelated.ts');
    });
  });

  describe('handleCreate', () => {
    it('rejects invalid names and duplicate names in folderTree (root and nested)', async () => {
      const addNotification = vi.fn();
      const sidebarState = makeSidebarState({
        folderTree: [
          asNormalizedTreeNode({
            name: 'src',
            type: 'folder',
            path: ['src'],
            children: [
              asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['src', 'App.js'] }),
            ],
          }),
          asNormalizedTreeNode({ name: 'index.html', type: 'file', path: ['index.html'] }),
        ],
      });

      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ sidebarState, addNotification })),
      );

      expect(
        await result.current.handleCreate(
          makeRow({
            item: asNormalizedTreeNode({ name: 'Root', type: 'folder', path: [], isRoot: true }),
            path: [],
            pathStr: '',
          }),
          'file',
          'bad:name',
        ),
      ).toBe(false);
      expect(addNotification).toHaveBeenCalledWith(
        'Use a valid file or folder name without path separators.',
        'error',
      );

      expect(
        await result.current.handleCreate(
          makeRow({
            item: asNormalizedTreeNode({ name: 'Root', type: 'folder', path: [], isRoot: true }),
            path: [],
            pathStr: '',
          }),
          'file',
          'index.html',
        ),
      ).toBe(false);
      expect(addNotification).toHaveBeenCalledWith(
        'An item named "index.html" already exists here.',
        'error',
      );

      expect(
        await result.current.handleCreate(
          makeRow({
            item: asNormalizedTreeNode({ name: 'src', type: 'folder', path: ['src'] }),
            path: ['src'],
            pathStr: 'src',
          }),
          'file',
          'App.js',
        ),
      ).toBe(false);
    });

    it('handles missing parent node gracefully in sandbox mode and creates folders', async () => {
      const sidebarState = makeSidebarState({ folderTree: [] });
      const addNotification = vi.fn();
      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ sidebarState, addNotification })),
      );

      const created = await result.current.handleCreate(
        makeRow({
          item: asNormalizedTreeNode({ name: 'Root', type: 'folder', path: [], isRoot: true }),
          path: [],
          pathStr: '',
        }),
        'folder',
        'components',
      );

      expect(created).toBe(true);
      expect(sidebarState.folderTree[0]).toMatchObject({
        name: 'components',
        kind: 'directory',
      });
      expect(addNotification).toHaveBeenCalledWith('Folder "components" created', 'success');
    });

    it('returns false in sandbox mode if workspace is stale', async () => {
      const sidebarState = makeSidebarState();
      const isCurrentWorkspace = vi.fn(() => false);
      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ sidebarState, isCurrentWorkspace })),
      );

      const created = await result.current.handleCreate(
        makeRow({
          item: asNormalizedTreeNode({ name: 'Root', type: 'folder', path: [], isRoot: true }),
          path: [],
          pathStr: '',
        }),
        'file',
        'new.js',
      );

      expect(created).toBe(false);
      expect(sidebarState).not.toHaveBeenCalled();
    });

    it('returns false in local mode when dirHandle is missing', async () => {
      const addNotification = vi.fn();
      const fs = makeFileSystemApi({ mode: 'local' });
      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ fs, addNotification })),
      );

      const created = await result.current.handleCreate(
        makeRow({
          item: asNormalizedTreeNode({ name: 'src', type: 'folder', path: ['src'] }),
          path: ['src'],
          pathStr: 'src',
        }),
        'file',
        'App.js',
      );

      expect(created).toBe(false);
      expect(addNotification).toHaveBeenCalledWith(
        'The destination folder is no longer available.',
        'error',
      );
    });

    it('detects existing entry in dirHandle.entries() for both current and stale workspace', async () => {
      const addNotification = vi.fn();
      const fs = makeFileSystemApi({ mode: 'local' });
      const isCurrentWorkspace = vi.fn(() => true);
      const dirHandle = {
        entries: async function* () {
          yield ['other.ts', {}];
          yield ['existing.ts', {}];
        },
        getFileHandle: vi.fn(),
      } as unknown as FileSystemDirectoryHandle;

      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ fs, addNotification, isCurrentWorkspace })),
      );

      const row = makeRow({
        item: asNormalizedTreeNode({
          name: 'src',
          type: 'folder',
          path: ['src'],
          handle: dirHandle,
        }),
        path: ['src'],
        pathStr: 'src',
      });

      expect(await result.current.handleCreate(row, 'file', 'existing.ts')).toBe(false);
      expect(addNotification).toHaveBeenCalledWith(
        'An item named "existing.ts" already exists here.',
        'error',
      );
      expect(dirHandle.getFileHandle).not.toHaveBeenCalled();

      addNotification.mockClear();
      isCurrentWorkspace.mockReturnValue(false);
      expect(await result.current.handleCreate(row, 'file', 'existing.ts')).toBe(false);
      expect(addNotification).not.toHaveBeenCalled();
    });

    it('aborts local create cleanly when workspace becomes stale at each async checkpoint', async () => {
      const triggerRefresh = vi.fn();
      const loadChildren = vi.fn().mockResolvedValue(undefined);
      const fs = makeFileSystemApi({ mode: 'local', triggerRefresh });
      const isCurrentWorkspace = vi.fn();
      const writable = { close: vi.fn().mockResolvedValue(undefined) };
      const dirHandle = {
        entries: async function* () {
          yield ['other.ts', {}];
        },
        getFileHandle: vi.fn().mockResolvedValue({
          createWritable: vi.fn().mockResolvedValue(writable),
        }),
      } as unknown as FileSystemDirectoryHandle;

      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ fs, loadChildren, isCurrentWorkspace })),
      );
      const row = makeRow({
        item: asNormalizedTreeNode({
          name: 'src',
          type: 'folder',
          path: ['src'],
          handle: dirHandle,
        }),
        path: ['src'],
        pathStr: 'src',
      });

      // Stale right after entries() iteration
      isCurrentWorkspace.mockReturnValueOnce(false);
      expect(await result.current.handleCreate(row, 'file', 'new.ts')).toBe(false);
      expect(dirHandle.getFileHandle).not.toHaveBeenCalled();

      // Stale right after getFileHandle/close
      isCurrentWorkspace.mockReturnValueOnce(true).mockReturnValueOnce(false);
      expect(await result.current.handleCreate(row, 'file', 'new.ts')).toBe(false);
      expect(loadChildren).not.toHaveBeenCalled();

      // Stale after loadChildren completes -> skips triggerRefresh, still returns true
      isCurrentWorkspace
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      expect(await result.current.handleCreate(row, 'file', 'new.ts')).toBe(true);
      expect(loadChildren).toHaveBeenCalledWith(row, true);
      expect(triggerRefresh).not.toHaveBeenCalled();

      // All current -> calls triggerRefresh
      isCurrentWorkspace.mockReturnValue(true);
      expect(await result.current.handleCreate(row, 'file', 'new2.ts')).toBe(true);
      expect(triggerRefresh).toHaveBeenCalledTimes(1);
    });

    it('handles non-Error rejection and stale workspace during local create failure', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const addNotification = vi.fn();
      const fs = makeFileSystemApi({ mode: 'local' });
      const isCurrentWorkspace = vi.fn(() => true);
      const dirHandle = {
        entries: async function* () {},
        getDirectoryHandle: vi.fn().mockRejectedValue('quota exceeded'),
      } as unknown as FileSystemDirectoryHandle;

      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ fs, addNotification, isCurrentWorkspace })),
      );
      const row = makeRow({
        item: asNormalizedTreeNode({
          name: 'src',
          type: 'folder',
          path: ['src'],
          handle: dirHandle,
        }),
        path: ['src'],
        pathStr: 'src',
      });

      expect(await result.current.handleCreate(row, 'folder', 'sub')).toBe(false);
      expect(addNotification).toHaveBeenCalledWith(
        'Could not create "sub": quota exceeded',
        'error',
      );

      addNotification.mockClear();
      isCurrentWorkspace.mockImplementation(() => false);
      expect(await result.current.handleCreate(row, 'folder', 'sub')).toBe(false);
      expect(addNotification).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleDelete', () => {
    it('does nothing when trying to delete the root row', async () => {
      const sidebarState = makeSidebarState();
      const addNotification = vi.fn();
      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ sidebarState, addNotification })),
      );

      await result.current.handleDelete(
        makeRow({
          item: asNormalizedTreeNode({ name: 'Root', type: 'folder', path: [], isRoot: true }),
          path: [],
          pathStr: '',
        }),
      );

      expect(sidebarState).not.toHaveBeenCalled();
      expect(addNotification).not.toHaveBeenCalled();
    });

    it('notifies error in local mode when item handle or parent handle is missing', async () => {
      const addNotification = vi.fn();
      const fs = makeFileSystemApi({ mode: 'local', rootHandle: null });
      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ fs, addNotification })),
      );

      await result.current.handleDelete(
        makeRow({
          item: asNormalizedTreeNode({
            name: 'App.js',
            type: 'file',
            path: ['App.js'],
            handle: { name: 'App.js' } as FileSystemFileHandle,
          }),
        }),
      );

      expect(addNotification).toHaveBeenCalledWith(
        'The item is no longer available in the mounted project.',
        'error',
      );
    });

    it('uses fs.rootHandle when deleting a top-level entry in local mode', async () => {
      const removeEntry = vi.fn().mockResolvedValue(undefined);
      const triggerRefresh = vi.fn();
      const fs = makeFileSystemApi({
        mode: 'local',
        rootHandle: { removeEntry } as unknown as FileSystemDirectoryHandle,
        triggerRefresh,
      });
      const addNotification = vi.fn();

      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ fs, addNotification })),
      );

      await result.current.handleDelete(
        makeRow({
          item: asNormalizedTreeNode({
            name: 'README.md',
            type: 'file',
            path: ['README.md'],
            handle: { name: 'README.md' } as FileSystemFileHandle,
          }),
          path: ['README.md'],
          pathStr: 'README.md',
        }),
      );

      expect(removeEntry).toHaveBeenCalledWith('README.md', { recursive: true });
      expect(triggerRefresh).toHaveBeenCalledTimes(1);
      expect(addNotification).toHaveBeenCalledWith('"README.md" deleted', 'info');
    });

    it('aborts local delete if workspace changes during removeEntry or after rejection', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const removeEntry = vi.fn().mockResolvedValue(undefined);
      const triggerRefresh = vi.fn();
      const fs = makeFileSystemApi({
        mode: 'local',
        rootHandle: { removeEntry } as unknown as FileSystemDirectoryHandle,
        triggerRefresh,
      });
      const sidebarState = makeSidebarState();
      const addNotification = vi.fn();
      const isCurrentWorkspace = vi.fn(() => false);

      const { result } = renderHook(() =>
        useSidebarTreeMutations(
          makeMutationsArgs({ fs, sidebarState, addNotification, isCurrentWorkspace }),
        ),
      );

      const row = makeRow({
        item: asNormalizedTreeNode({
          name: 'README.md',
          type: 'file',
          path: ['README.md'],
          handle: { name: 'README.md' } as FileSystemFileHandle,
        }),
        path: ['README.md'],
        pathStr: 'README.md',
      });

      await result.current.handleDelete(row);
      expect(triggerRefresh).not.toHaveBeenCalled();
      expect(sidebarState).not.toHaveBeenCalled();

      removeEntry.mockRejectedValueOnce('cannot delete');
      await result.current.handleDelete(row);
      expect(addNotification).not.toHaveBeenCalled();

      isCurrentWorkspace.mockReturnValue(true);
      removeEntry.mockRejectedValueOnce('cannot delete');
      await result.current.handleDelete(row);
      expect(addNotification).toHaveBeenCalledWith(
        'Could not delete "README.md": cannot delete',
        'error',
      );
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('aborts sandbox delete if workspace is not current', async () => {
      const sidebarState = makeSidebarState();
      const isCurrentWorkspace = vi.fn(() => false);
      const { result } = renderHook(() =>
        useSidebarTreeMutations(makeMutationsArgs({ sidebarState, isCurrentWorkspace })),
      );

      await result.current.handleDelete(
        makeRow({
          item: asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['App.js'] }),
        }),
      );

      expect(sidebarState).not.toHaveBeenCalled();
    });

    it('deletes folder, removes nested tabs, updates activeTabId to last remaining or null, preserves unrelated activeTabId, and cleans editor/changeSet state', async () => {
      const sidebarState = makeSidebarState({
        folderTree: [
          asNormalizedTreeNode({
            name: 'src',
            type: 'folder',
            path: ['src'],
            children: [
              asNormalizedTreeNode({ name: 'App.js', type: 'file', path: ['src', 'App.js'] }),
            ],
          }),
          asNormalizedTreeNode({ name: 'README.md', type: 'file', path: ['README.md'] }),
        ],
      });
      const tabState = createMockTabState({
        openTabs: [
          { id: 'README.md', label: 'README.md', type: 'file' },
          { id: 'src', label: 'src', type: 'file' },
          { id: 'src/App.js', label: 'App.js', type: 'file' },
        ],
        activeTabId: 'src/App.js',
        lastCodeTabId: 'src/App.js',
      });
      const editorState = createMockEditorState({
        fileContents: { 'src/App.js': 'code', 'README.md': 'hi' },
      });
      const changeSetState = makeChangeSetState({
        items: [
          {
            id: 'cs-1',
            request: 'edit',
            status: 'pending-review',
            createdAt: 1,
            files: [{ path: 'src/App.js', originalContent: '', proposedContent: 'x' }],
          },
        ],
      });
      const addNotification = vi.fn();

      const { result } = renderHook(() =>
        useSidebarTreeMutations(
          makeMutationsArgs({
            sidebarState,
            tabState,
            editorState,
            changeSetState,
            addNotification,
          }),
        ),
      );

      await result.current.handleDelete(
        makeRow({
          item: asNormalizedTreeNode({ name: 'src', type: 'folder', path: ['src'] }),
          path: ['src'],
          pathStr: 'src',
        }),
      );

      expect(tabState.openTabs.map((t) => t.id)).toEqual(['README.md']);
      expect(tabState.activeTabId).toBe('README.md');
      expect(tabState.lastCodeTabId).toBe('README.md');
      expect(editorState.fileContents).toEqual({ 'README.md': 'hi' });
      expect(changeSetState.items).toEqual([]);

      // Delete remaining active tab -> activeTabId and lastCodeTabId become null
      await result.current.handleDelete(
        makeRow({
          item: asNormalizedTreeNode({ name: 'README.md', type: 'file', path: ['README.md'] }),
          path: ['README.md'],
          pathStr: 'README.md',
        }),
      );
      expect(tabState.openTabs).toEqual([]);
      expect(tabState.activeTabId).toBeNull();
      expect(tabState.lastCodeTabId).toBeNull();
    });

    it('preserves activeTabId when deleting an inactive tab', async () => {
      const tabState = createMockTabState({
        openTabs: [
          { id: 'a.js', label: 'a.js', type: 'file' },
          { id: 'b.js', label: 'b.js', type: 'file' },
        ],
        activeTabId: 'a.js',
      });
      const { result } = renderHook(() => useSidebarTreeMutations(makeMutationsArgs({ tabState })));

      await result.current.handleDelete(
        makeRow({
          item: asNormalizedTreeNode({ name: 'b.js', type: 'file', path: ['b.js'] }),
          path: ['b.js'],
          pathStr: 'b.js',
        }),
      );

      expect(tabState.openTabs.map((t) => t.id)).toEqual(['a.js']);
      expect(tabState.activeTabId).toBe('a.js');
    });
  });
});
