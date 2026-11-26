import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from '@/components/Storage/Settings';
import { makeDirectoryHandle, makeFileHandle, makeFileSystemApi } from '@/test-utils/fsMocks';
import {
  createMockStateStore,
  makeChangeSetState,
  makeSidebarState,
  makeTabState,
} from '@/test-utils/stateMocks';
import type { Tab, TreeNode } from '@/types/domain-types';
import {
  approveAllChangeSetChanges,
  type EditorDraft,
  undoAllChangeSetChanges,
} from './approveAndUndo';

const makeDraftStore = (initial: EditorDraft = {}) => createMockStateStore<EditorDraft>(initial);
const makeTab = (id: string): Tab => ({ id, type: 'file', label: id });
const makeFileNode = (name: string): TreeNode => ({ name, type: 'file', path: [name] });

const makeCsState = (paths: string[], id = 'cs-1') =>
  makeChangeSetState({
    items: [
      {
        id,
        request: 'bulk',
        status: 'pending-review',
        createdAt: 1,
        files: paths.map((path) => ({
          path,
          originalContent: 'old',
          proposedContent: 'new',
          hunks: [],
          status: 'pending-review',
        })),
      },
    ],
  });

describe('ChangeSet/approveAndUndo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Settings, 'setFileContents').mockResolvedValue(true as never);
    vi.spyOn(Settings, 'setPendingDiffs').mockResolvedValue(true as never);
    vi.spyOn(Settings, 'setPendingDeletions').mockResolvedValue(true as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('approveAllChangeSetChanges', () => {
    it('returns zeroes immediately when workspace is no longer current', async () => {
      const editorState = makeDraftStore({
        pendingDiffs: {
          'a.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
        },
      });
      const result = await approveAllChangeSetChanges({
        changeSetId: 'cs-1',
        editorState,
        changeSetState: makeCsState(['a.js']),
        isWorkspaceCurrent: () => false,
      });

      expect(result).toEqual({ applied: 0, rejected: 0, conflicted: 0 });
      expect(editorState).not.toHaveBeenCalled();
    });

    it('handles empty or undefined pendingDiffs and pendingDeletions and ignores other changeSetIds', async () => {
      const editorState = makeDraftStore({
        pendingDiffs: {
          'other.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-other' },
        },
        pendingDeletions: undefined,
      });

      const result = await approveAllChangeSetChanges({
        changeSetId: 'cs-1',
        editorState,
        changeSetState: null,
      });

      expect(result).toEqual({ applied: 0, rejected: 0, conflicted: 0 });
      expect(Settings.setFileContents).not.toHaveBeenCalled();

      // Also when both pendingDiffs and pendingDeletions are undefined
      const emptyEditor = makeDraftStore({});
      await expect(
        approveAllChangeSetChanges({
          changeSetId: 'cs-1',
          editorState: emptyEditor,
          changeSetState: null,
        }),
      ).resolves.toEqual({ applied: 0, rejected: 0, conflicted: 0 });
    });

    it('approves modified diffs (using dirty buffers & fallback), new files, and deletions with mounted fs', async () => {
      const rootHandle = makeDirectoryHandle('root');
      const writeFileAtPath = vi.fn(async () => true);
      const deleteFileAtPath = vi.fn(async () => true);
      const readFileAtPath = vi.fn(async () => 'old');
      const getFileHandleAtPath = vi.fn(async () => null);

      const editorState = makeDraftStore({
        fileContents: { 'a.js': 'old', 'del.js': 'old' },
        dirtyBufferContents: { 'a.js': 'dirty-a' },
        pendingDiffs: {
          'a.js': { originalContent: 'old', modifiedContent: 'new-a', changeSetId: 'cs-1' },
          // missing from fileContents/dirtyBufferContents -> falls back to diff.modifiedContent
          'new.js': {
            originalContent: '',
            modifiedContent: 'created-content',
            isNewFile: true,
            changeSetId: 'cs-1',
          },
          'other.js': { originalContent: 'x', modifiedContent: 'y', changeSetId: 'cs-other' },
        },
        pendingDeletions: {
          'del.js': { originalContent: 'old', changeSetId: 'cs-1' },
        },
      });
      const tabState = makeTabState({
        activeTabId: 'del.js',
        openTabs: [makeTab('a.js'), makeTab('del.js')],
      });
      const sidebarState = makeSidebarState({
        folderTree: [makeFileNode('a.js'), makeFileNode('del.js')],
      });
      const changeSetState = makeCsState(['a.js', 'new.js', 'del.js']);

      const result = await approveAllChangeSetChanges({
        changeSetId: 'cs-1',
        editorState,
        changeSetState: changeSetState as never,
        tabState,
        sidebarState: sidebarState as never,
        fs: makeFileSystemApi({
          rootHandle,
          writeFileAtPath,
          deleteFileAtPath,
          readFileAtPath,
          getFileHandleAtPath,
        }),
      });

      expect(result).toEqual({ applied: 3, rejected: 0, conflicted: 0 });
      expect(writeFileAtPath).toHaveBeenCalledWith('a.js', 'dirty-a', rootHandle);
      expect(writeFileAtPath).toHaveBeenCalledWith('new.js', 'created-content', rootHandle);
      expect(deleteFileAtPath).toHaveBeenCalledWith('del.js', rootHandle);
      expect(editorState.pendingDiffs).toEqual({
        'other.js': { originalContent: 'x', modifiedContent: 'y', changeSetId: 'cs-other' },
      });
      expect(editorState.pendingDeletions).toEqual({});
      expect(editorState.fileContents).toEqual({ 'a.js': 'dirty-a' });
      expect(tabState.openTabs).toEqual([makeTab('a.js')]);
      expect(editorState.pendingFileOperations).toBeUndefined();
      expect(Settings.setFileContents).toHaveBeenCalled();
      expect(Settings.setPendingDiffs).toHaveBeenCalled();
      expect(Settings.setPendingDeletions).toHaveBeenCalled();
    });

    it('skips locked files, detects conflicts, handles write/delete false and throws', async () => {
      const rootHandle = makeDirectoryHandle('root');
      const editorState = makeDraftStore({
        fileContents: {
          'locked.js': 'new',
          'conflict.js': 'new',
          'new-conflict.js': 'new',
          'write-false.js': 'new',
          'write-throw.js': 'new',
          'del-locked.js': 'old',
          'del-conflict.js': 'old',
          'del-false.js': 'old',
          'del-throw.js': 'old',
        },
        pendingFileOperations: { 'locked.js': 'lock-1', 'del-locked.js': 'lock-2' },
        pendingDiffs: {
          'locked.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
          'conflict.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
          'new-conflict.js': {
            originalContent: '',
            modifiedContent: 'new',
            isNewFile: true,
            changeSetId: 'cs-1',
          },
          'write-false.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
          'write-throw.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
        },
        pendingDeletions: {
          'del-locked.js': { originalContent: 'old', changeSetId: 'cs-1' },
          'del-conflict.js': { originalContent: 'old', changeSetId: 'cs-1' },
          'del-false.js': { originalContent: 'old', changeSetId: 'cs-1' },
          'del-throw.js': { originalContent: 'old', changeSetId: 'cs-1' },
        },
      });
      const changeSetState = makeCsState([
        'locked.js',
        'conflict.js',
        'new-conflict.js',
        'write-false.js',
        'write-throw.js',
        'del-locked.js',
        'del-conflict.js',
        'del-false.js',
        'del-throw.js',
      ]);

      const result = await approveAllChangeSetChanges({
        changeSetId: 'cs-1',
        editorState,
        changeSetState: changeSetState as never,
        fs: makeFileSystemApi({
          rootHandle,
          readFileAtPath: vi.fn(async (path) =>
            path.includes('conflict') ? 'externally-changed' : 'old',
          ),
          getFileHandleAtPath: vi.fn(async () => makeFileHandle('new-conflict.js')),
          writeFileAtPath: vi.fn(async (path) => {
            if (path === 'write-false.js') return false;
            throw new Error('write error');
          }),
          deleteFileAtPath: vi.fn(async (path) => {
            if (path === 'del-false.js') return false;
            throw new Error('delete error');
          }),
        }),
      });

      expect(result).toEqual({ applied: 0, rejected: 0, conflicted: 3 });
      expect(console.error).toHaveBeenCalledTimes(2);
      expect(editorState.pendingFileOperations).toEqual({
        'locked.js': 'lock-1',
        'del-locked.js': 'lock-2',
      });
    });

    it('skips diffs/deletions that mutate mid-flight before or after fs operations or before final commit', async () => {
      const rootHandle = makeDirectoryHandle('root');
      const editorState = makeDraftStore({
        fileContents: {
          'd1.js': 'new',
          'd2.js': 'new',
          'd3.js': 'new',
          'del1.js': 'old',
          'del2.js': 'old',
          'del3.js': 'old',
        },
        pendingDiffs: {
          'd1.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
          'd2.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
          'd3.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
        },
        pendingDeletions: {
          'del1.js': { originalContent: 'old', changeSetId: 'cs-1' },
          'del2.js': { originalContent: 'old', changeSetId: 'cs-1' },
          'del3.js': { originalContent: 'old', changeSetId: 'cs-1' },
        },
      });

      // Mutate del1 during acquireFileOperation (line 132)
      const origStore = editorState;
      const proxyStore = new Proxy(origStore, {
        apply(_t, _thisArg, args: [(draft: EditorDraft) => void]) {
          // When final commit runs (draft has commitDirtyBufferContentsInDraft), mutate d3 & del3 before commit
          if (args[0].toString().includes('commitDirtyBufferContentsInDraft')) {
            origStore((d) => {
              if (d.pendingDiffs) delete d.pendingDiffs['d3.js'];
              if (d.pendingDeletions) delete d.pendingDeletions['del3.js'];
            });
          }
          origStore(args[0]);
          if (
            origStore.pendingFileOperations?.['del1.js'] &&
            origStore.pendingDeletions?.['del1.js']
          ) {
            origStore((d) => {
              if (d.pendingDeletions) delete d.pendingDeletions['del1.js'];
            });
          }
        },
      });

      const result = await approveAllChangeSetChanges({
        changeSetId: 'cs-1',
        editorState: proxyStore,
        changeSetState: makeCsState([
          'd1.js',
          'd2.js',
          'd3.js',
          'del1.js',
          'del2.js',
          'del3.js',
        ]) as never,
        fs: makeFileSystemApi({
          rootHandle,
          readFileAtPath: vi.fn(async (path) => {
            if (path === 'd1.js') {
              origStore((d) => {
                if (d.pendingDiffs) delete d.pendingDiffs['d1.js'];
              });
            }
            return 'old';
          }),
          writeFileAtPath: vi.fn(async (path) => {
            if (path === 'd2.js') {
              origStore((d) => {
                if (d.pendingDiffs) delete d.pendingDiffs['d2.js'];
              });
            }
            return true;
          }),
          deleteFileAtPath: vi.fn(async (path) => {
            if (path === 'del2.js') {
              origStore((d) => {
                if (d.pendingDeletions) delete d.pendingDeletions['del2.js'];
              });
            }
            return true;
          }),
        }),
      });

      expect(result).toEqual({ applied: 0, rejected: 0, conflicted: 0 });
    });

    it('approves deletion-only changeset when acceptedDiffs is empty and write/delete helpers are omitted', async () => {
      const rootHandle = makeDirectoryHandle('root');
      const editorState = makeDraftStore({
        fileContents: { 'del.js': 'old' },
        pendingDeletions: {
          'del.js': { originalContent: 'old', changeSetId: 'cs-1' },
        },
      });
      const changeSetState = makeCsState(['del.js']);

      const result = await approveAllChangeSetChanges({
        changeSetId: 'cs-1',
        editorState,
        changeSetState: changeSetState as never,
        fs: { rootHandle },
      });

      expect(result).toEqual({ applied: 1, rejected: 0, conflicted: 0 });
      expect(editorState.fileContents).toEqual({});
      expect(editorState.pendingDeletions).toEqual({});
      expect(changeSetState.items[0].files[0].status).toBe('accepted');
    });

    it('handles final commit when draft maps are missing inside updater', async () => {
      const editorState = makeDraftStore({
        fileContents: { 'a.js': 'new' },
        pendingDiffs: {
          'a.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
        },
      });
      const proxyStore = new Proxy(editorState, {
        apply(_t, _thisArg, args: [(draft: EditorDraft) => void]) {
          if (args[0].toString().includes('commitDirtyBufferContentsInDraft')) {
            editorState((d) => {
              d.pendingDiffs = undefined;
              d.pendingDeletions = undefined;
              d.fileContents = undefined;
            });
          }
          editorState(args[0]);
        },
      });

      const result = await approveAllChangeSetChanges({
        changeSetId: 'cs-1',
        editorState: proxyStore,
        changeSetState: null,
      });

      expect(result).toEqual({ applied: 0, rejected: 0, conflicted: 0 });
    });

    it('stops cleanly when workspace becomes stale at every async checkpoint in approveAllChangeSetChanges', async () => {
      const rootHandle = makeDirectoryHandle('root');

      // 1. Stale at top of 2nd diff (line 82)
      let calls1 = 0;
      const es1 = makeDraftStore({
        fileContents: { 'a.js': 'new', 'b.js': 'new' },
        pendingDiffs: {
          'a.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
          'b.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
        },
      });
      await expect(
        approveAllChangeSetChanges({
          changeSetId: 'cs-1',
          editorState: es1,
          changeSetState: null,
          // checks: entry(1), loop-a(2), post-conflict-a(3), post-write-a(4), loop-b(5 -> false)
          isWorkspaceCurrent: () => ++calls1 < 5,
        }),
      ).resolves.toEqual({ applied: 1, rejected: 0, conflicted: 0 });

      // 2. Stale after conflict check on diff (line 89)
      let current2 = true;
      const es2 = makeDraftStore({
        fileContents: { 'a.js': 'new' },
        pendingDiffs: {
          'a.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
        },
      });
      await expect(
        approveAllChangeSetChanges({
          changeSetId: 'cs-1',
          editorState: es2,
          changeSetState: null,
          fs: makeFileSystemApi({
            rootHandle,
            readFileAtPath: vi.fn(async () => {
              current2 = false;
              return 'old';
            }),
          }),
          isWorkspaceCurrent: () => current2,
        }),
      ).resolves.toEqual({ applied: 0, rejected: 0, conflicted: 0 });

      // 3. Stale after writeFileAtPath success (line 107) and after writeFileAtPath catch (line 110)
      let current3 = true;
      const es3 = makeDraftStore({
        fileContents: { 'a.js': 'new' },
        pendingDiffs: {
          'a.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
        },
      });
      await expect(
        approveAllChangeSetChanges({
          changeSetId: 'cs-1',
          editorState: es3,
          changeSetState: null,
          fs: makeFileSystemApi({
            rootHandle,
            readFileAtPath: vi.fn(async () => 'old'),
            writeFileAtPath: vi.fn(async () => {
              current3 = false;
              return true;
            }),
          }),
          isWorkspaceCurrent: () => current3,
        }),
      ).resolves.toEqual({ applied: 0, rejected: 0, conflicted: 0 });

      let current3b = true;
      const es3b = makeDraftStore({
        fileContents: { 'a.js': 'new' },
        pendingDiffs: {
          'a.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
        },
      });
      await expect(
        approveAllChangeSetChanges({
          changeSetId: 'cs-1',
          editorState: es3b,
          changeSetState: null,
          fs: makeFileSystemApi({
            rootHandle,
            readFileAtPath: vi.fn(async () => 'old'),
            writeFileAtPath: vi.fn(async () => {
              current3b = false;
              throw new Error('stale write');
            }),
          }),
          isWorkspaceCurrent: () => current3b,
        }),
      ).resolves.toEqual({ applied: 0, rejected: 0, conflicted: 0 });

      // 4. Stale between write block and line 115
      let calls4 = 0;
      const es4 = makeDraftStore({
        fileContents: { 'a.js': 'new' },
        pendingDiffs: {
          'a.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
        },
      });
      await expect(
        approveAllChangeSetChanges({
          changeSetId: 'cs-1',
          editorState: es4,
          changeSetState: null,
          fs: makeFileSystemApi({
            rootHandle,
            readFileAtPath: vi.fn(async () => 'old'),
            writeFileAtPath: vi.fn(async () => true),
          }),
          // entry(1), loop(2), post-conflict(3), post-write(4), line 115(5 -> false)
          isWorkspaceCurrent: () => ++calls4 < 5,
        }),
      ).resolves.toEqual({ applied: 0, rejected: 0, conflicted: 0 });

      // 5. Stale inside deletions loop (line 128, 136, 145, 148, 153)
      let calls5 = 0;
      const es5 = makeDraftStore({
        pendingDeletions: {
          'd1.js': { originalContent: 'old', changeSetId: 'cs-1' },
          'd2.js': { originalContent: 'old', changeSetId: 'cs-1' },
        },
      });
      await expect(
        approveAllChangeSetChanges({
          changeSetId: 'cs-1',
          editorState: es5,
          changeSetState: null,
          // entry(1), post-diffs(2), loop-d1(3), post-conflict-d1(4), post-del-d1(5), loop-d2(6 -> false)
          isWorkspaceCurrent: () => ++calls5 < 6,
        }),
      ).resolves.toEqual({ applied: 1, rejected: 0, conflicted: 0 });

      let current6 = true;
      await expect(
        approveAllChangeSetChanges({
          changeSetId: 'cs-1',
          editorState: makeDraftStore({
            pendingDeletions: { 'd1.js': { originalContent: 'old', changeSetId: 'cs-1' } },
          }),
          changeSetState: null,
          fs: makeFileSystemApi({
            rootHandle,
            readFileAtPath: vi.fn(async () => {
              current6 = false;
              return 'old';
            }),
          }),
          isWorkspaceCurrent: () => current6,
        }),
      ).resolves.toEqual({ applied: 0, rejected: 0, conflicted: 0 });

      let current7 = true;
      await expect(
        approveAllChangeSetChanges({
          changeSetId: 'cs-1',
          editorState: makeDraftStore({
            pendingDeletions: { 'd1.js': { originalContent: 'old', changeSetId: 'cs-1' } },
          }),
          changeSetState: null,
          fs: makeFileSystemApi({
            rootHandle,
            readFileAtPath: vi.fn(async () => 'old'),
            deleteFileAtPath: vi.fn(async () => {
              current7 = false;
              return true;
            }),
          }),
          isWorkspaceCurrent: () => current7,
        }),
      ).resolves.toEqual({ applied: 0, rejected: 0, conflicted: 0 });

      let current7b = true;
      await expect(
        approveAllChangeSetChanges({
          changeSetId: 'cs-1',
          editorState: makeDraftStore({
            pendingDeletions: { 'd1.js': { originalContent: 'old', changeSetId: 'cs-1' } },
          }),
          changeSetState: null,
          fs: makeFileSystemApi({
            rootHandle,
            readFileAtPath: vi.fn(async () => 'old'),
            deleteFileAtPath: vi.fn(async () => {
              current7b = false;
              throw new Error('stale delete');
            }),
          }),
          isWorkspaceCurrent: () => current7b,
        }),
      ).resolves.toEqual({ applied: 0, rejected: 0, conflicted: 0 });

      let calls8 = 0;
      await expect(
        approveAllChangeSetChanges({
          changeSetId: 'cs-1',
          editorState: makeDraftStore({
            pendingDeletions: { 'd1.js': { originalContent: 'old', changeSetId: 'cs-1' } },
          }),
          changeSetState: null,
          fs: makeFileSystemApi({
            rootHandle,
            readFileAtPath: vi.fn(async () => 'old'),
            deleteFileAtPath: vi.fn(async () => true),
          }),
          // entry(1), post-diffs(2), loop-d1(3), post-conflict(4), post-del(5), line 153(6 -> false)
          isWorkspaceCurrent: () => ++calls8 < 6,
        }),
      ).resolves.toEqual({ applied: 0, rejected: 0, conflicted: 0 });
    });
  });

  describe('undoAllChangeSetChanges', () => {
    it('returns zeroes immediately when workspace is no longer current', async () => {
      const editorState = makeDraftStore({
        pendingDiffs: {
          'a.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
        },
      });
      const result = await undoAllChangeSetChanges({
        changeSetId: 'cs-1',
        editorState,
        changeSetState: null,
        isWorkspaceCurrent: () => false,
      });

      expect(result).toEqual({ applied: 0, rejected: 0, conflicted: 0 });
      expect(editorState).not.toHaveBeenCalled();
    });

    it('reverts modified files, removes new files, clears pending deletions, and updates stores', async () => {
      const rootHandle = makeDirectoryHandle('root');
      const writeFileAtPath = vi.fn(async () => true);
      const editorState = makeDraftStore({
        fileContents: { 'a.js': 'new', 'new.js': 'created', 'del.js': 'old' },
        dirtyBufferContents: { 'a.js': 'dirty-a' },
        pendingDiffs: {
          'a.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
          'new.js': {
            originalContent: '',
            modifiedContent: 'created',
            isNewFile: true,
            changeSetId: 'cs-1',
          },
          'other.js': { originalContent: 'x', modifiedContent: 'y', changeSetId: 'cs-other' },
        },
        pendingDeletions: {
          'del.js': { originalContent: 'old', changeSetId: 'cs-1' },
        },
      });
      const tabState = makeTabState({
        activeTabId: 'new.js',
        openTabs: [makeTab('a.js'), makeTab('new.js')],
      });
      const sidebarState = makeSidebarState({
        folderTree: [makeFileNode('a.js'), makeFileNode('new.js')],
      });
      const changeSetState = makeCsState(['a.js', 'new.js', 'del.js']);

      const result = await undoAllChangeSetChanges({
        changeSetId: 'cs-1',
        editorState,
        changeSetState: changeSetState as never,
        tabState,
        sidebarState: sidebarState as never,
        fs: makeFileSystemApi({
          rootHandle,
          readFileAtPath: vi.fn(async () => 'old'),
          getFileHandleAtPath: vi.fn(async () => null),
          writeFileAtPath,
        }),
      });

      expect(result).toEqual({ applied: 0, rejected: 3, conflicted: 0 });
      expect(writeFileAtPath).toHaveBeenCalledTimes(1);
      expect(writeFileAtPath).toHaveBeenCalledWith('a.js', 'old', rootHandle);
      expect(editorState.fileContents).toEqual({ 'a.js': 'old', 'del.js': 'old' });
      expect(editorState.pendingDiffs).toEqual({
        'other.js': { originalContent: 'x', modifiedContent: 'y', changeSetId: 'cs-other' },
      });
      expect(editorState.pendingDeletions).toEqual({});
      expect(tabState.openTabs).toEqual([makeTab('a.js')]);
      expect(editorState.pendingFileOperations).toBeUndefined();
      expect(Settings.setFileContents).toHaveBeenCalled();
      expect(Settings.setPendingDiffs).toHaveBeenCalled();
      expect(Settings.setPendingDeletions).toHaveBeenCalled();
    });

    it('skips locked files, detects conflicts, and handles writeFileAtPath false and throws', async () => {
      const rootHandle = makeDirectoryHandle('root');
      const editorState = makeDraftStore({
        fileContents: {
          'locked.js': 'new',
          'conflict.js': 'new',
          'new-conflict.js': 'created',
          'write-false.js': 'new',
          'write-throw.js': 'new',
        },
        pendingFileOperations: { 'locked.js': 'lock-1' },
        pendingDiffs: {
          'locked.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
          'conflict.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
          'new-conflict.js': {
            originalContent: '',
            modifiedContent: 'created',
            isNewFile: true,
            changeSetId: 'cs-1',
          },
          'write-false.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
          'write-throw.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
        },
      });
      const changeSetState = makeCsState([
        'locked.js',
        'conflict.js',
        'new-conflict.js',
        'write-false.js',
        'write-throw.js',
      ]);

      const result = await undoAllChangeSetChanges({
        changeSetId: 'cs-1',
        editorState,
        changeSetState: changeSetState as never,
        fs: makeFileSystemApi({
          rootHandle,
          readFileAtPath: vi.fn(async (path) => (path === 'conflict.js' ? 'external' : 'old')),
          getFileHandleAtPath: vi.fn(async () => makeFileHandle('new-conflict.js')),
          writeFileAtPath: vi.fn(async (path) => {
            if (path === 'write-false.js') return false;
            throw new Error('restore failed');
          }),
        }),
      });

      expect(result).toEqual({ applied: 0, rejected: 0, conflicted: 2 });
      expect(console.error).toHaveBeenCalledTimes(1);
    });

    it('skips diffs/deletions that mutate mid-flight and handles missing draft maps', async () => {
      const origStore = makeDraftStore({
        fileContents: { 'd1.js': 'new', 'd2.js': 'new', 'del1.js': 'old' },
        pendingDiffs: {
          'd1.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
          'd2.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
        },
        pendingDeletions: {
          'del1.js': { originalContent: 'old', changeSetId: 'cs-1' },
        },
      });

      const proxyStore = new Proxy(origStore, {
        apply(_t, _thisArg, args: [(draft: EditorDraft) => void]) {
          origStore(args[0]);
          if (origStore.pendingFileOperations?.['d1.js'] && origStore.pendingDiffs?.['d1.js']) {
            origStore((d) => {
              if (d.pendingDiffs) delete d.pendingDiffs['d1.js'];
            });
          }
          if (args[0].toString().includes('commitDirtyBufferContentsInDraft')) {
            origStore((d) => {
              d.pendingDiffs = undefined;
              d.pendingDeletions = undefined;
              d.fileContents = undefined;
            });
          }
        },
      });

      const result = await undoAllChangeSetChanges({
        changeSetId: 'cs-1',
        editorState: proxyStore,
        changeSetState: null,
      });

      // d2.js + del1.js counted in loop, then skipped inside final draft because maps were cleared
      expect(result).toEqual({ applied: 0, rejected: 2, conflicted: 0 });
    });

    it('stops cleanly when workspace becomes stale at every async checkpoint in undoAllChangeSetChanges', async () => {
      const rootHandle = makeDirectoryHandle('root');

      // 1. Stale at top of 2nd diff (line 232 -> line 268)
      let calls1 = 0;
      await expect(
        undoAllChangeSetChanges({
          changeSetId: 'cs-1',
          editorState: makeDraftStore({
            fileContents: { 'a.js': 'new', 'b.js': 'new' },
            pendingDiffs: {
              'a.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
              'b.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
            },
          }),
          changeSetState: null,
          // entry(1), loop-a(2), post-conflict-a(3), post-write-a(4), loop-b(5 -> false)
          isWorkspaceCurrent: () => ++calls1 < 5,
        }),
      ).resolves.toEqual({ applied: 0, rejected: 1, conflicted: 0 });

      // 2. Stale after conflict check (line 242)
      let current2 = true;
      await expect(
        undoAllChangeSetChanges({
          changeSetId: 'cs-1',
          editorState: makeDraftStore({
            pendingDiffs: {
              'a.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
            },
          }),
          changeSetState: null,
          fs: makeFileSystemApi({
            rootHandle,
            readFileAtPath: vi.fn(async () => {
              current2 = false;
              return 'old';
            }),
          }),
          isWorkspaceCurrent: () => current2,
        }),
      ).resolves.toEqual({ applied: 0, rejected: 0, conflicted: 0 });

      // 3. Stale after writeFileAtPath success (line 255) and catch (line 258)
      let current3 = true;
      await expect(
        undoAllChangeSetChanges({
          changeSetId: 'cs-1',
          editorState: makeDraftStore({
            pendingDiffs: {
              'a.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
            },
          }),
          changeSetState: null,
          fs: makeFileSystemApi({
            rootHandle,
            readFileAtPath: vi.fn(async () => 'old'),
            writeFileAtPath: vi.fn(async () => {
              current3 = false;
              return true;
            }),
          }),
          isWorkspaceCurrent: () => current3,
        }),
      ).resolves.toEqual({ applied: 0, rejected: 0, conflicted: 0 });

      let current3b = true;
      await expect(
        undoAllChangeSetChanges({
          changeSetId: 'cs-1',
          editorState: makeDraftStore({
            pendingDiffs: {
              'a.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
            },
          }),
          changeSetState: null,
          fs: makeFileSystemApi({
            rootHandle,
            readFileAtPath: vi.fn(async () => 'old'),
            writeFileAtPath: vi.fn(async () => {
              current3b = false;
              throw new Error('stale undo write');
            }),
          }),
          isWorkspaceCurrent: () => current3b,
        }),
      ).resolves.toEqual({ applied: 0, rejected: 0, conflicted: 0 });

      // 4. Stale at line 263
      let calls4 = 0;
      await expect(
        undoAllChangeSetChanges({
          changeSetId: 'cs-1',
          editorState: makeDraftStore({
            pendingDiffs: {
              'a.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
            },
          }),
          changeSetState: null,
          fs: makeFileSystemApi({
            rootHandle,
            readFileAtPath: vi.fn(async () => 'old'),
            writeFileAtPath: vi.fn(async () => true),
          }),
          // entry(1), loop(2), post-conflict(3), post-write(4), line 263(5 -> false)
          isWorkspaceCurrent: () => ++calls4 < 5,
        }),
      ).resolves.toEqual({ applied: 0, rejected: 0, conflicted: 0 });

      // 5. Stale inside deletions loop (line 273 -> line 276)
      let calls5 = 0;
      await expect(
        undoAllChangeSetChanges({
          changeSetId: 'cs-1',
          editorState: makeDraftStore({
            pendingDeletions: {
              'd1.js': { originalContent: 'old', changeSetId: 'cs-1' },
              'd2.js': { originalContent: 'old', changeSetId: 'cs-1' },
            },
          }),
          changeSetState: null,
          // entry(1), post-diffs(2), loop-d1(3), loop-d2(4 -> false)
          isWorkspaceCurrent: () => ++calls5 < 4,
        }),
      ).resolves.toEqual({ applied: 0, rejected: 2, conflicted: 0 });
    });
  });
});
