import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ExtendedEditorState,
  PendingDeletionEntry,
} from '@/components/App/Views/EditorArea/types';
import { makeDirectoryHandle, makeFileHandle, makeFileSystemApi } from '@/test-utils/fsMocks';
import {
  makeAppState,
  makeChangeSetState,
  makeEditorState,
  makeShortcutActionContext,
  makeSidebarState,
  makeTabState,
} from '@/test-utils/stateMocks';
import type { PendingDiff, Tab, TreeNode } from '@/types/domain-types';
import { approveSaveShortcutAction, cancelChangesShortcutAction } from './changeReviewActions';

const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const makeTab = (id: string): Tab => ({
  id,
  type: 'file',
  label: id.split('/').pop() ?? id,
});

const makeFileNode = (name: string, path: string[]): TreeNode => ({
  name,
  type: 'file',
  path,
});

const makeDiff = (overrides: Partial<PendingDiff> = {}): PendingDiff => ({
  originalContent: 'old',
  modifiedContent: 'new',
  diffs: [],
  ...overrides,
});

const makeDeletion = (originalContent = 'old', changeSetId = ''): PendingDeletionEntry => ({
  originalContent,
  changeSetId,
});

describe('shortcuts/changeReviewActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('approveSaveShortcutAction', () => {
    it('returns early when there is no activeTabId', () => {
      const showNotification = vi.fn();
      const editorState = makeEditorState();

      approveSaveShortcutAction(
        makeShortcutActionContext({
          tabState: makeTabState({ activeTabId: null }),
          editorState,
          showNotification,
        }),
      );

      expect(editorState).not.toHaveBeenCalled();
      expect(showNotification).not.toHaveBeenCalled();
    });

    it('notifies Project saved when there is no pending deletion or diff', () => {
      const showNotification = vi.fn();
      approveSaveShortcutAction(
        makeShortcutActionContext({
          tabState: makeTabState({ activeTabId: 'a.js' }),
          editorState: makeEditorState({
            pendingDeletions: undefined,
            pendingDiffs: undefined,
          }),
          showNotification,
        }),
      );
      expect(showNotification).toHaveBeenCalledWith('Project saved', 'success');

      // Also safe when showNotification is omitted
      approveSaveShortcutAction(
        makeShortcutActionContext({
          tabState: makeTabState({ activeTabId: 'a.js' }),
          editorState: makeEditorState(),
        }),
      );
    });

    describe('pending deletions', () => {
      it('approves object pending deletion with mounted fs and cleans up editor, tabs, sidebar, and changeset', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const deleteFileAtPath = vi.fn(async () => true);
        const readFileAtPath = vi.fn(async () => 'old content');
        const showNotification = vi.fn();
        const editorState = makeEditorState({
          fileContents: { 'src/a.js': 'old content', 'src/b.js': 'keep' },
          pendingDeletions: {
            'src/a.js': makeDeletion('old content', 'cs-1'),
          },
        });
        const tabState = makeTabState({
          activeTabId: 'src/a.js',
          openTabs: [makeTab('src/a.js'), makeTab('src/b.js')],
          lastCodeTabId: 'src/a.js',
        });
        const sidebarState = makeSidebarState({
          folderTree: [
            {
              name: 'src',
              type: 'folder',
              path: ['src'],
              children: [
                makeFileNode('a.js', ['src', 'a.js']),
                makeFileNode('b.js', ['src', 'b.js']),
              ],
            },
          ],
        });
        const changeSetState = makeChangeSetState({
          items: [
            {
              id: 'cs-1',
              request: 'del',
              status: 'pending-review',
              createdAt: 1,
              files: [
                {
                  path: 'src/a.js',
                  originalContent: 'old content',
                  deleted: true,
                  hunks: [],
                  status: 'pending-review',
                },
              ],
            },
          ],
        });

        approveSaveShortcutAction(
          makeShortcutActionContext({
            appState: makeAppState({ workspaceEpoch: 2 }),
            tabState,
            editorState,
            sidebarState,
            changeSetState,
            fs: makeFileSystemApi({ rootHandle, readFileAtPath, deleteFileAtPath }),
            showNotification,
          }),
        );

        await flushAsync();

        expect(readFileAtPath).toHaveBeenCalledWith('src/a.js', rootHandle);
        expect(deleteFileAtPath).toHaveBeenCalledWith('src/a.js', rootHandle);
        expect(editorState.fileContents['src/a.js']).toBeUndefined();
        expect(editorState.pendingDeletions?.['src/a.js']).toBeUndefined();
        expect(tabState.openTabs).toEqual([makeTab('src/b.js')]);
        expect(tabState.activeTabId).toBe('src/b.js');
        expect(changeSetState.items[0].files[0].status).toBe('accepted');
        expect(changeSetState.items[0].status).toBe('reviewed');
        expect(showNotification).toHaveBeenCalledWith('Deletion approved', 'success');
      });

      it('approves legacy boolean pending deletion without fs or showNotification', async () => {
        const editorState = makeEditorState({
          fileContents: { 'a.js': 'old' },
          pendingDeletions: { 'a.js': true },
        });
        const tabState = makeTabState({
          activeTabId: 'a.js',
          openTabs: [makeTab('a.js')],
        });
        const changeSetState = makeChangeSetState();

        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState,
            editorState,
            changeSetState,
            fs: undefined,
          }),
        );

        await flushAsync();

        expect(editorState.fileContents['a.js']).toBeUndefined();
        expect(editorState.pendingDeletions).toEqual({});
        expect(tabState.openTabs).toEqual([]);
      });

      it('marks deletion conflicted when external file content differs', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const deleteFileAtPath = vi.fn(async () => true);
        const showNotification = vi.fn();
        const editorState = makeEditorState({
          fileContents: { 'a.js': 'old' },
          pendingDeletions: {
            'a.js': makeDeletion('old'),
          },
        });
        const changeSetState = makeChangeSetState({
          items: [
            {
              id: 'cs-1',
              request: 'del',
              status: 'pending-review',
              createdAt: 1,
              files: [
                {
                  path: 'a.js',
                  originalContent: 'old',
                  deleted: true,
                  hunks: [],
                  status: 'pending-review',
                },
              ],
            },
          ],
        });

        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState,
            changeSetState,
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'changed externally'),
              deleteFileAtPath,
            }),
            showNotification,
          }),
        );

        await flushAsync();

        expect(deleteFileAtPath).not.toHaveBeenCalled();
        expect(editorState.pendingDeletions?.['a.js']).toBeDefined();
        expect(showNotification).toHaveBeenCalledWith(
          'The file changed outside the editor; deletion was not approved.',
          'error',
        );
      });

      it('marks deletion conflicted in changeSetState when changeSetId is set', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const editorState = makeEditorState({
          pendingDeletions: {
            'a.js': makeDeletion('old', 'cs-1'),
          },
        });
        const changeSetState = makeChangeSetState({
          items: [
            {
              id: 'cs-1',
              request: 'del',
              status: 'pending-review',
              createdAt: 1,
              files: [
                {
                  path: 'a.js',
                  originalContent: 'old',
                  deleted: true,
                  hunks: [],
                  status: 'pending-review',
                },
              ],
            },
          ],
        });

        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState,
            changeSetState,
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'externally modified'),
            }),
          }),
        );

        await flushAsync();
        expect(changeSetState.items[0].files[0].status).toBe('conflicted');
      });

      it('notifies error when deleteFileAtPath returns false', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const showNotification = vi.fn();
        const editorState = makeEditorState({
          fileContents: { 'a.js': 'old' },
          pendingDeletions: {
            'a.js': makeDeletion('old', 'cs-1'),
          },
        });

        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState,
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'old'),
              deleteFileAtPath: vi.fn(async () => false),
            }),
            showNotification,
          }),
        );

        await flushAsync();

        expect(showNotification).toHaveBeenCalledWith(
          'Could not delete the file from the mounted project',
          'error',
        );
        expect(editorState.pendingDeletions?.['a.js']).toBeDefined();
      });

      it('handles Error and non-Error rejections from deleteFileAtPath, and suppresses notification if epoch changed', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const showNotification = vi.fn();

        // Error instance
        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: makeEditorState({
              pendingDeletions: { 'a.js': makeDeletion('old') },
            }),
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'old'),
              deleteFileAtPath: vi.fn(async () => {
                throw new Error('permission denied');
              }),
            }),
            showNotification,
          }),
        );
        await flushAsync();
        expect(showNotification).toHaveBeenCalledWith(
          'Could not delete the file: permission denied',
          'error',
        );

        // Non-Error rejection
        showNotification.mockClear();
        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: makeEditorState({
              pendingDeletions: { 'a.js': makeDeletion('old') },
            }),
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'old'),
              deleteFileAtPath: vi.fn(async () => {
                throw 'string-failure';
              }),
            }),
            showNotification,
          }),
        );
        await flushAsync();
        expect(showNotification).toHaveBeenCalledWith(
          'Could not delete the file: string-failure',
          'error',
        );

        // Epoch changed before rejection
        showNotification.mockClear();
        const appState = makeAppState({ workspaceEpoch: 1 });
        approveSaveShortcutAction(
          makeShortcutActionContext({
            appState,
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: makeEditorState({
              pendingDeletions: { 'a.js': makeDeletion('old') },
            }),
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'old'),
              deleteFileAtPath: vi.fn(async () => {
                appState((d) => {
                  d.workspaceEpoch = 99;
                });
                throw new Error('stale');
              }),
            }),
            showNotification,
          }),
        );
        await flushAsync();
        expect(showNotification).not.toHaveBeenCalled();
      });

      it('aborts deletion approval when workspace epoch or pendingDeletion changes mid-flight or operation is locked', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const deleteFileAtPath = vi.fn(async () => true);

        // Locked operation
        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: makeEditorState({
              pendingFileOperations: { 'a.js': 'tok' },
              pendingDeletions: { 'a.js': makeDeletion('old') },
            }),
            fs: makeFileSystemApi({ rootHandle, deleteFileAtPath }),
          }),
        );
        await flushAsync();
        expect(deleteFileAtPath).not.toHaveBeenCalled();

        // Epoch changes during readFileAtPath
        const appState1 = makeAppState({ workspaceEpoch: 1 });
        approveSaveShortcutAction(
          makeShortcutActionContext({
            appState: appState1,
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: makeEditorState({
              pendingDeletions: { 'a.js': makeDeletion('old') },
            }),
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => {
                appState1((d) => {
                  d.workspaceEpoch = 2;
                });
                return 'old';
              }),
              deleteFileAtPath,
            }),
          }),
        );
        await flushAsync();
        expect(deleteFileAtPath).not.toHaveBeenCalled();

        // Epoch changes during deleteFileAtPath
        const appState2 = makeAppState({ workspaceEpoch: 1 });
        const showNotification2 = vi.fn();
        approveSaveShortcutAction(
          makeShortcutActionContext({
            appState: appState2,
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: makeEditorState({
              pendingDeletions: { 'a.js': makeDeletion('old') },
            }),
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'old'),
              deleteFileAtPath: vi.fn(async () => {
                appState2((d) => {
                  d.workspaceEpoch = 2;
                });
                return true;
              }),
            }),
            showNotification: showNotification2,
          }),
        );
        await flushAsync();
        expect(showNotification2).not.toHaveBeenCalled();

        // pendingDeletion changes during deleteFileAtPath -> removed === false
        const showNotification3 = vi.fn();
        const editorState3 = makeEditorState({
          pendingDeletions: { 'a.js': makeDeletion('old', 'cs-1') },
        });
        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: editorState3,
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'old'),
              deleteFileAtPath: vi.fn(async () => {
                editorState3((d) => {
                  d.pendingDeletions = {
                    'a.js': makeDeletion('different', 'cs-2'),
                  };
                });
                return true;
              }),
            }),
            showNotification: showNotification3,
          }),
        );
        await flushAsync();
        expect(showNotification3).not.toHaveBeenCalled();
        expect(editorState3.pendingDeletions?.['a.js']).toEqual({
          originalContent: 'different',
          changeSetId: 'cs-2',
        });

        // Mutated right during acquireFileOperation (hits initial check on line 39)
        const showNotification4 = vi.fn();
        const appState4 = makeAppState({ workspaceEpoch: 1 });
        const origUpdater = makeEditorState({
          pendingDeletions: { 'a.js': makeDeletion('old') },
        });
        const proxyEditor4 = new Proxy(origUpdater, {
          apply(_t, _thisArg, args: [(draft: ExtendedEditorState) => void]) {
            origUpdater(args[0]);
            appState4((d) => {
              d.workspaceEpoch = 999;
            });
          },
        });
        approveSaveShortcutAction(
          makeShortcutActionContext({
            appState: appState4,
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: proxyEditor4,
            showNotification: showNotification4,
          }),
        );
        await flushAsync();
        expect(showNotification4).not.toHaveBeenCalled();
      });

      it('aborts deletion approval at line 70 if workspace becomes stale when rootHandle is absent', async () => {
        const showNotification = vi.fn();
        let reads = 0;
        const baseAppState = makeAppState({ workspaceEpoch: 1 });
        const appState = new Proxy(baseAppState, {
          get(target, prop, receiver) {
            if (prop === 'workspaceEpoch') {
              reads++;
              // 1: initial capture (line 28), 2: line 39, 3: line 70 -> return stale
              return reads >= 3 ? 2 : 1;
            }
            return Reflect.get(target, prop, receiver);
          },
        });
        const editorState = makeEditorState({
          pendingDeletions: { 'a.js': true },
        });

        approveSaveShortcutAction(
          makeShortcutActionContext({
            appState,
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState,
            fs: undefined,
            showNotification,
          }),
        );

        await flushAsync();
        expect(showNotification).not.toHaveBeenCalled();
        expect(editorState.pendingDeletions?.['a.js']).toBe(true);
      });

      it('approves deletion without changeSetId on object deletion', async () => {
        const showNotification = vi.fn();
        const editorState = makeEditorState({
          fileContents: { 'a.js': 'old' },
          pendingDeletions: { 'a.js': makeDeletion('old') },
        });

        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({
              activeTabId: 'a.js',
              openTabs: [makeTab('a.js')],
            }),
            editorState,
            showNotification,
          }),
        );

        await flushAsync();
        expect(showNotification).toHaveBeenCalledWith('Deletion approved', 'success');
      });
    });

    describe('pending diffs', () => {
      it('approves existing file diff using dirtyBufferContents, writes to fs, and updates changeset', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const writeFileAtPath = vi.fn(async () => true);
        const showNotification = vi.fn();
        const editorState = makeEditorState({
          fileContents: { 'a.js': 'old' },
          dirtyBufferContents: { 'a.js': 'dirty-edited' },
          pendingDiffs: {
            'a.js': makeDiff({
              modifiedContent: 'proposed',
              isNewFile: false,
              changeSetId: 'cs-1',
            }),
          },
        });
        const changeSetState = makeChangeSetState({
          items: [
            {
              id: 'cs-1',
              request: 'edit',
              status: 'pending-review',
              createdAt: 1,
              files: [
                {
                  path: 'a.js',
                  originalContent: 'old',
                  proposedContent: 'proposed',
                  hunks: [],
                  status: 'pending-review',
                },
              ],
            },
          ],
        });

        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState,
            changeSetState,
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'old'),
              writeFileAtPath,
            }),
            showNotification,
          }),
        );

        await flushAsync();

        expect(writeFileAtPath).toHaveBeenCalledWith('a.js', 'dirty-edited', rootHandle);
        expect(editorState.pendingDiffs).toEqual({});
        expect(changeSetState.items[0].files[0].status).toBe('accepted');
        expect(showNotification).toHaveBeenCalledWith('Changes approved & saved', 'success');
      });

      it('approves new file diff when unexpected file does not exist and skips write when content is undefined', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const writeFileAtPath = vi.fn(async () => true);
        const getFileHandleAtPath = vi.fn(async () => null);
        const editorState = makeEditorState({
          fileContents: {},
          pendingDiffs: {
            'new.js': makeDiff({
              originalContent: '',
              modifiedContent: 'abc',
              isNewFile: true,
            }),
          },
        });

        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'new.js' }),
            editorState,
            fs: makeFileSystemApi({
              rootHandle,
              getFileHandleAtPath,
              writeFileAtPath,
            }),
          }),
        );

        await flushAsync();

        expect(getFileHandleAtPath).toHaveBeenCalledWith('new.js', rootHandle);
        expect(writeFileAtPath).not.toHaveBeenCalled();
        expect(editorState.pendingDiffs).toEqual({});
      });

      it('marks new file diff conflicted when file unexpectedly exists on disk', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const showNotification = vi.fn();
        const editorState = makeEditorState({
          fileContents: { 'new.js': 'content' },
          pendingDiffs: {
            'new.js': makeDiff({
              originalContent: '',
              modifiedContent: 'content',
              isNewFile: true,
              changeSetId: 'cs-1',
            }),
          },
        });
        const changeSetState = makeChangeSetState({
          items: [
            {
              id: 'cs-1',
              request: 'new',
              status: 'pending-review',
              createdAt: 1,
              files: [
                {
                  path: 'new.js',
                  originalContent: '',
                  proposedContent: 'content',
                  hunks: [],
                  status: 'pending-review',
                },
              ],
            },
          ],
        });

        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'new.js' }),
            editorState,
            changeSetState,
            fs: makeFileSystemApi({
              rootHandle,
              getFileHandleAtPath: vi.fn(async () => makeFileHandle('new.js')),
            }),
            showNotification,
          }),
        );

        await flushAsync();

        expect(changeSetState.items[0].files[0].status).toBe('conflicted');
        expect(showNotification).toHaveBeenCalledWith(
          'The file changed outside the editor; changes were not approved.',
          'error',
        );
      });

      it('marks existing diff conflicted without changeSetId and without showNotification', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const editorState = makeEditorState({
          fileContents: { 'a.js': 'new' },
          pendingDiffs: {
            'a.js': makeDiff(),
          },
        });

        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState,
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'changed'),
            }),
          }),
        );

        await flushAsync();
        expect(editorState.pendingDiffs?.['a.js']).toBeDefined();
      });

      it('notifies error when writeFileAtPath returns false', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const showNotification = vi.fn();
        const editorState = makeEditorState({
          fileContents: { 'a.js': 'new' },
          pendingDiffs: {
            'a.js': makeDiff({ changeSetId: 'cs-1' }),
          },
        });

        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState,
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'old'),
              writeFileAtPath: vi.fn(async () => false),
            }),
            showNotification,
          }),
        );

        await flushAsync();
        expect(showNotification).toHaveBeenCalledWith(
          'Could not save the file to the mounted project',
          'error',
        );
        expect(editorState.pendingDiffs?.['a.js']).toBeDefined();
      });

      it('catches Error and non-Error rejections during diff approval and ignores if epoch changed', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const showNotification = vi.fn();

        // Error from getFileHandleAtPath (catchErrors: false)
        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'new.js' }),
            editorState: makeEditorState({
              fileContents: { 'new.js': 'x' },
              pendingDiffs: {
                'new.js': makeDiff({ originalContent: '', modifiedContent: 'x', isNewFile: true }),
              },
            }),
            fs: makeFileSystemApi({
              rootHandle,
              getFileHandleAtPath: vi.fn(async () => {
                throw new Error('fs probe failed');
              }),
            }),
            showNotification,
          }),
        );
        await flushAsync();
        expect(showNotification).toHaveBeenCalledWith(
          'Could not save the file: fs probe failed',
          'error',
        );

        // Non-Error from writeFileAtPath
        showNotification.mockClear();
        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: makeEditorState({
              fileContents: { 'a.js': 'new' },
              pendingDiffs: {
                'a.js': makeDiff(),
              },
            }),
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'old'),
              writeFileAtPath: vi.fn(async () => {
                throw 'write-boom';
              }),
            }),
            showNotification,
          }),
        );
        await flushAsync();
        expect(showNotification).toHaveBeenCalledWith(
          'Could not save the file: write-boom',
          'error',
        );

        // Epoch changed before catch runs
        showNotification.mockClear();
        const appState = makeAppState({ workspaceEpoch: 1 });
        approveSaveShortcutAction(
          makeShortcutActionContext({
            appState,
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: makeEditorState({
              fileContents: { 'a.js': 'new' },
              pendingDiffs: {
                'a.js': makeDiff(),
              },
            }),
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'old'),
              writeFileAtPath: vi.fn(async () => {
                appState((d) => {
                  d.workspaceEpoch = 2;
                });
                throw new Error('stale error');
              }),
            }),
            showNotification,
          }),
        );
        await flushAsync();
        expect(showNotification).not.toHaveBeenCalled();
      });

      it('aborts diff approval if workspace epoch or pendingDiff changes mid-flight or operation is locked', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const writeFileAtPath = vi.fn(async () => true);

        // Locked
        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: makeEditorState({
              fileContents: { 'a.js': 'new' },
              pendingFileOperations: { 'a.js': 'locked' },
              pendingDiffs: { 'a.js': makeDiff() },
            }),
            fs: makeFileSystemApi({ rootHandle, writeFileAtPath }),
          }),
        );
        await flushAsync();
        expect(writeFileAtPath).not.toHaveBeenCalled();

        // Mutated during acquireFileOperation (line 103)
        const appState0 = makeAppState({ workspaceEpoch: 1 });
        const origEditor0 = makeEditorState({
          fileContents: { 'a.js': 'new' },
          pendingDiffs: { 'a.js': makeDiff() },
        });
        const proxyEditor0 = new Proxy(origEditor0, {
          apply(_t, _thisArg, args: [(draft: ExtendedEditorState) => void]) {
            origEditor0(args[0]);
            appState0((d) => {
              d.workspaceEpoch = 5;
            });
          },
        });
        approveSaveShortcutAction(
          makeShortcutActionContext({
            appState: appState0,
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: proxyEditor0,
            fs: makeFileSystemApi({ rootHandle, writeFileAtPath }),
          }),
        );
        await flushAsync();
        expect(writeFileAtPath).not.toHaveBeenCalled();

        // Epoch changes during conflict check (line 107)
        const appState1 = makeAppState({ workspaceEpoch: 1 });
        approveSaveShortcutAction(
          makeShortcutActionContext({
            appState: appState1,
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: makeEditorState({
              fileContents: { 'a.js': 'new' },
              pendingDiffs: { 'a.js': makeDiff() },
            }),
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => {
                appState1((d) => {
                  d.workspaceEpoch = 2;
                });
                return 'old';
              }),
              writeFileAtPath,
            }),
          }),
        );
        await flushAsync();
        expect(writeFileAtPath).not.toHaveBeenCalled();

        // Epoch changes during writeFileAtPath (line 118)
        const appState2 = makeAppState({ workspaceEpoch: 1 });
        const showNotification2 = vi.fn();
        approveSaveShortcutAction(
          makeShortcutActionContext({
            appState: appState2,
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: makeEditorState({
              fileContents: { 'a.js': 'new' },
              pendingDiffs: { 'a.js': makeDiff() },
            }),
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'old'),
              writeFileAtPath: vi.fn(async () => {
                appState2((d) => {
                  d.workspaceEpoch = 2;
                });
                return true;
              }),
            }),
            showNotification: showNotification2,
          }),
        );
        await flushAsync();
        expect(showNotification2).not.toHaveBeenCalled();

        // pendingDiff changes during writeFileAtPath (line 124 / 127)
        const showNotification3 = vi.fn();
        const editorState3 = makeEditorState({
          fileContents: { 'a.js': 'new' },
          pendingDiffs: { 'a.js': makeDiff() },
        });
        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: editorState3,
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'old'),
              writeFileAtPath: vi.fn(async () => {
                editorState3((d) => {
                  d.pendingDiffs = {
                    'a.js': makeDiff({ modifiedContent: 'other' }),
                  };
                });
                return true;
              }),
            }),
            showNotification: showNotification3,
          }),
        );
        await flushAsync();
        expect(showNotification3).not.toHaveBeenCalled();
      });

      it('aborts diff approval if pendingDiff mutates between line 124 and draft callback', async () => {
        const showNotification = vi.fn();
        const origEditor = makeEditorState({
          fileContents: { 'a.js': 'new' },
          pendingDiffs: { 'a.js': makeDiff() },
        });
        let callCount = 0;
        const proxyEditor = new Proxy(origEditor, {
          apply(_t, _thisArg, args: [(draft: ExtendedEditorState) => void]) {
            callCount++;
            // On the second update (removing pendingDiff), mutate pendingDiffs before running cb
            if (callCount === 2) {
              origEditor((d) => {
                d.pendingDiffs = {};
              });
            }
            origEditor(args[0]);
          },
        });

        approveSaveShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: proxyEditor,
            showNotification,
          }),
        );
        await flushAsync();
        expect(showNotification).not.toHaveBeenCalled();
      });
    });
  });

  describe('cancelChangesShortcutAction', () => {
    it('returns early when activeTabId is null or no pending deletion/diff exists', () => {
      const showNotification = vi.fn();
      const editorState = makeEditorState({
        pendingDeletions: undefined,
        pendingDiffs: undefined,
      });

      cancelChangesShortcutAction(
        makeShortcutActionContext({
          tabState: makeTabState({ activeTabId: null }),
          editorState,
          showNotification,
        }),
      );
      expect(editorState).not.toHaveBeenCalled();

      cancelChangesShortcutAction(
        makeShortcutActionContext({
          tabState: makeTabState({ activeTabId: 'a.js' }),
          editorState,
          showNotification,
        }),
      );
      expect(editorState).not.toHaveBeenCalled();
      expect(showNotification).not.toHaveBeenCalled();
    });

    describe('pending deletions', () => {
      it('does nothing if file operation is already pending', () => {
        const showNotification = vi.fn();
        const editorState = makeEditorState({
          pendingFileOperations: { 'a.js': 'tok' },
          pendingDeletions: { 'a.js': makeDeletion('old', 'cs-1') },
        });

        cancelChangesShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState,
            showNotification,
          }),
        );

        expect(editorState).not.toHaveBeenCalled();
        expect(showNotification).not.toHaveBeenCalled();
      });

      it('cancels object pending deletion, updates changeset to rejected, and notifies', () => {
        const showNotification = vi.fn();
        const editorState = makeEditorState({
          pendingDeletions: {
            'a.js': makeDeletion('old', 'cs-1'),
          },
        });
        const changeSetState = makeChangeSetState({
          items: [
            {
              id: 'cs-1',
              request: 'del',
              status: 'pending-review',
              createdAt: 1,
              files: [
                {
                  path: 'a.js',
                  originalContent: 'old',
                  deleted: true,
                  hunks: [],
                  status: 'pending-review',
                },
              ],
            },
          ],
        });

        cancelChangesShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState,
            changeSetState,
            showNotification,
          }),
        );

        expect(editorState.pendingDeletions).toEqual({});
        expect(changeSetState.items[0].files[0].status).toBe('rejected');
        expect(showNotification).toHaveBeenCalledWith('Deletion cancelled', 'info');
      });

      it('cancels legacy boolean pending deletion and handles missing changeSetId or showNotification', () => {
        const editorState = makeEditorState({
          pendingDeletions: { 'a.js': true },
        });
        cancelChangesShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState,
          }),
        );
        expect(editorState.pendingDeletions).toEqual({});

        const editorState2 = makeEditorState({
          pendingDeletions: { 'a.js': makeDeletion('old') },
        });
        cancelChangesShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: editorState2,
            changeSetState: makeChangeSetState(),
          }),
        );
        expect(editorState2.pendingDeletions).toEqual({});
      });

      it('handles draft.pendingDeletions becoming undefined inside updater', () => {
        const origEditor = makeEditorState({
          pendingDeletions: { 'a.js': true },
        });
        const proxyEditor = new Proxy(origEditor, {
          apply(_t, _thisArg, args: [(draft: ExtendedEditorState) => void]) {
            origEditor((d) => {
              d.pendingDeletions = undefined;
            });
            origEditor(args[0]);
          },
        });

        cancelChangesShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: proxyEditor,
          }),
        );

        expect(origEditor.pendingDeletions).toBeUndefined();
      });
    });

    describe('pending diffs', () => {
      it('cancels existing file diff, writes original content to fs, restores cursorPos, and rejects changeset', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const writeFileAtPath = vi.fn(async () => true);
        const showNotification = vi.fn();
        const editorState = makeEditorState({
          fileContents: { 'a.js': 'new' },
          dirtyBufferContents: { 'a.js': 'new-dirty', 'other.js': 'other-dirty' },
          cursorPos: { 'a.js': { line: 9, col: 9, index: 50 } },
          pendingDiffs: {
            'a.js': makeDiff({
              originalCursorPos: { line: 2, col: 4, index: 10 },
              changeSetId: 'cs-1',
            }),
          },
        });
        const changeSetState = makeChangeSetState({
          items: [
            {
              id: 'cs-1',
              request: 'edit',
              status: 'pending-review',
              createdAt: 1,
              files: [
                {
                  path: 'a.js',
                  originalContent: 'old',
                  proposedContent: 'new',
                  hunks: [],
                  status: 'pending-review',
                },
              ],
            },
          ],
        });

        cancelChangesShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState,
            changeSetState,
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'old'),
              writeFileAtPath,
            }),
            showNotification,
          }),
        );

        await flushAsync();

        expect(writeFileAtPath).toHaveBeenCalledWith('a.js', 'old', rootHandle);
        expect(editorState.fileContents['a.js']).toBe('old');
        expect(editorState.fileContents['other.js']).toBe('other-dirty');
        expect(editorState.cursorPos?.['a.js']).toEqual({ line: 2, col: 4, index: 10 });
        expect(editorState.pendingDiffs).toEqual({});
        expect(changeSetState.items[0].files[0].status).toBe('rejected');
        expect(showNotification).toHaveBeenCalledWith('Changes cancelled', 'info');
      });

      it('cancels existing file diff without originalCursorPos, changeSetId, fs, or showNotification', async () => {
        const editorState = makeEditorState({
          fileContents: { 'a.js': 'new' },
          cursorPos: { 'a.js': { line: 3, col: 1, index: 5 } },
          pendingDiffs: {
            'a.js': makeDiff(),
          },
        });

        cancelChangesShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState,
            fs: undefined,
          }),
        );

        await flushAsync();

        expect(editorState.fileContents['a.js']).toBe('old');
        expect(editorState.cursorPos?.['a.js']).toEqual({ line: 3, col: 1, index: 5 });
        expect(editorState.pendingDiffs).toEqual({});
      });

      it('cancels new file diff by removing editor state, tabs, sidebar node, and marking rejected', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const writeFileAtPath = vi.fn(async () => true);
        const showNotification = vi.fn();
        const editorState = makeEditorState({
          fileContents: { 'src/new.js': 'created' },
          pendingDiffs: {
            'src/new.js': makeDiff({
              originalContent: '',
              modifiedContent: 'created',
              isNewFile: true,
              changeSetId: 'cs-1',
            }),
          },
        });
        const tabState = makeTabState({
          activeTabId: 'src/new.js',
          openTabs: [makeTab('src/new.js')],
        });
        const sidebarState = makeSidebarState({
          folderTree: [
            {
              name: 'src',
              type: 'folder',
              path: ['src'],
              children: [makeFileNode('new.js', ['src', 'new.js'])],
            },
          ],
        });
        const changeSetState = makeChangeSetState({
          items: [
            {
              id: 'cs-1',
              request: 'new',
              status: 'pending-review',
              createdAt: 1,
              files: [
                {
                  path: 'src/new.js',
                  originalContent: '',
                  proposedContent: 'created',
                  isNewFile: true,
                  hunks: [],
                  status: 'pending-review',
                },
              ],
            },
          ],
        });

        cancelChangesShortcutAction(
          makeShortcutActionContext({
            tabState,
            editorState,
            sidebarState,
            changeSetState,
            fs: makeFileSystemApi({
              rootHandle,
              getFileHandleAtPath: vi.fn(async () => null),
              writeFileAtPath,
            }),
            showNotification,
          }),
        );

        await flushAsync();

        expect(writeFileAtPath).not.toHaveBeenCalled();
        expect(editorState.fileContents['src/new.js']).toBeUndefined();
        expect(tabState.openTabs).toEqual([]);
        expect(changeSetState.items[0].files[0].status).toBe('rejected');
        expect(showNotification).toHaveBeenCalledWith('New file cancelled', 'info');
      });

      it('cancels new file diff without changeSetId or showNotification', async () => {
        const editorState = makeEditorState({
          fileContents: { 'new.js': 'created' },
          pendingDiffs: {
            'new.js': makeDiff({
              originalContent: '',
              modifiedContent: 'created',
              isNewFile: true,
            }),
          },
        });

        cancelChangesShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({
              activeTabId: 'new.js',
              openTabs: [makeTab('new.js')],
            }),
            editorState,
          }),
        );

        await flushAsync();
        expect(editorState.fileContents['new.js']).toBeUndefined();
      });

      it('marks conflicted on external conflict for both existing and new files', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const showNotification = vi.fn();
        const changeSetState = makeChangeSetState({
          items: [
            {
              id: 'cs-1',
              request: 'edit',
              status: 'pending-review',
              createdAt: 1,
              files: [
                {
                  path: 'a.js',
                  originalContent: 'old',
                  proposedContent: 'new',
                  hunks: [],
                  status: 'pending-review',
                },
                {
                  path: 'new.js',
                  originalContent: '',
                  proposedContent: 'created',
                  hunks: [],
                  status: 'pending-review',
                },
              ],
            },
          ],
        });

        // Existing file conflict with changeSetId
        cancelChangesShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: makeEditorState({
              fileContents: { 'a.js': 'new' },
              pendingDiffs: {
                'a.js': makeDiff({ changeSetId: 'cs-1' }),
              },
            }),
            changeSetState,
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'external'),
            }),
            showNotification,
          }),
        );
        await flushAsync();
        expect(changeSetState.items[0].files[0].status).toBe('conflicted');
        expect(showNotification).toHaveBeenCalledWith(
          'The file changed outside the editor; changes were not cancelled.',
          'error',
        );

        // New file conflict without changeSetId
        showNotification.mockClear();
        cancelChangesShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'new.js' }),
            editorState: makeEditorState({
              fileContents: { 'new.js': 'created' },
              pendingDiffs: {
                'new.js': makeDiff({
                  originalContent: '',
                  modifiedContent: 'created',
                  isNewFile: true,
                }),
              },
            }),
            fs: makeFileSystemApi({
              rootHandle,
              getFileHandleAtPath: vi.fn(async () => makeFileHandle('new.js')),
            }),
            showNotification,
          }),
        );
        await flushAsync();
        expect(showNotification).toHaveBeenCalledWith(
          'The file changed outside the editor; changes were not cancelled.',
          'error',
        );
      });

      it('notifies error when writeFileAtPath returns false during cancel', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const showNotification = vi.fn();

        cancelChangesShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: makeEditorState({
              fileContents: { 'a.js': 'new' },
              pendingDiffs: {
                'a.js': makeDiff(),
              },
            }),
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'old'),
              writeFileAtPath: vi.fn(async () => false),
            }),
            showNotification,
          }),
        );

        await flushAsync();
        expect(showNotification).toHaveBeenCalledWith(
          'Could not restore the file in the mounted project',
          'error',
        );
      });

      it('handles Error and non-Error rejections during cancel and skips notify if stale', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const showNotification = vi.fn();

        // Error instance
        cancelChangesShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'new.js' }),
            editorState: makeEditorState({
              pendingDiffs: {
                'new.js': makeDiff({ originalContent: '', modifiedContent: 'x', isNewFile: true }),
              },
            }),
            fs: makeFileSystemApi({
              rootHandle,
              getFileHandleAtPath: vi.fn(async () => {
                throw new Error('disk offline');
              }),
            }),
            showNotification,
          }),
        );
        await flushAsync();
        expect(showNotification).toHaveBeenCalledWith(
          'Could not restore the file: disk offline',
          'error',
        );

        // Non-Error rejection
        showNotification.mockClear();
        cancelChangesShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: makeEditorState({
              pendingDiffs: {
                'a.js': makeDiff(),
              },
            }),
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'old'),
              writeFileAtPath: vi.fn(async () => {
                throw 'restore-failed';
              }),
            }),
            showNotification,
          }),
        );
        await flushAsync();
        expect(showNotification).toHaveBeenCalledWith(
          'Could not restore the file: restore-failed',
          'error',
        );

        // Epoch changed before catch
        showNotification.mockClear();
        const appState = makeAppState({ workspaceEpoch: 1 });
        cancelChangesShortcutAction(
          makeShortcutActionContext({
            appState,
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: makeEditorState({
              pendingDiffs: {
                'a.js': makeDiff(),
              },
            }),
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'old'),
              writeFileAtPath: vi.fn(async () => {
                appState((d) => {
                  d.workspaceEpoch = 2;
                });
                throw new Error('stale');
              }),
            }),
            showNotification,
          }),
        );
        await flushAsync();
        expect(showNotification).not.toHaveBeenCalled();
      });

      it('aborts cancel if workspace epoch or pendingDiff changes mid-flight or operation is locked', async () => {
        const rootHandle = makeDirectoryHandle('root');
        const writeFileAtPath = vi.fn(async () => true);

        // Locked
        cancelChangesShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: makeEditorState({
              pendingFileOperations: { 'a.js': 'tok' },
              pendingDiffs: { 'a.js': makeDiff() },
            }),
            fs: makeFileSystemApi({ rootHandle, writeFileAtPath }),
          }),
        );
        await flushAsync();
        expect(writeFileAtPath).not.toHaveBeenCalled();

        // Line 195 epoch changed during acquireFileOperation
        const appState0 = makeAppState({ workspaceEpoch: 1 });
        const origEditor0 = makeEditorState({
          pendingDiffs: { 'a.js': makeDiff() },
        });
        const proxyEditor0 = new Proxy(origEditor0, {
          apply(_t, _thisArg, args: [(draft: ExtendedEditorState) => void]) {
            origEditor0(args[0]);
            appState0((d) => {
              d.workspaceEpoch = 3;
            });
          },
        });
        cancelChangesShortcutAction(
          makeShortcutActionContext({
            appState: appState0,
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: proxyEditor0,
            fs: makeFileSystemApi({ rootHandle, writeFileAtPath }),
          }),
        );
        await flushAsync();
        expect(writeFileAtPath).not.toHaveBeenCalled();

        // Line 199 epoch changed during conflict check
        const appState1 = makeAppState({ workspaceEpoch: 1 });
        cancelChangesShortcutAction(
          makeShortcutActionContext({
            appState: appState1,
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: makeEditorState({
              pendingDiffs: { 'a.js': makeDiff() },
            }),
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => {
                appState1((d) => {
                  d.workspaceEpoch = 2;
                });
                return 'old';
              }),
              writeFileAtPath,
            }),
          }),
        );
        await flushAsync();
        expect(writeFileAtPath).not.toHaveBeenCalled();

        // Line 210 epoch changed during writeFileAtPath
        const appState2 = makeAppState({ workspaceEpoch: 1 });
        const showNotification2 = vi.fn();
        cancelChangesShortcutAction(
          makeShortcutActionContext({
            appState: appState2,
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: makeEditorState({
              pendingDiffs: { 'a.js': makeDiff() },
            }),
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'old'),
              writeFileAtPath: vi.fn(async () => {
                appState2((d) => {
                  d.workspaceEpoch = 2;
                });
                return true;
              }),
            }),
            showNotification: showNotification2,
          }),
        );
        await flushAsync();
        expect(showNotification2).not.toHaveBeenCalled();

        // Line 216 pendingDiff changed during writeFileAtPath
        const showNotification3 = vi.fn();
        const editorState3 = makeEditorState({
          pendingDiffs: { 'a.js': makeDiff() },
        });
        cancelChangesShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: editorState3,
            fs: makeFileSystemApi({
              rootHandle,
              readFileAtPath: vi.fn(async () => 'old'),
              writeFileAtPath: vi.fn(async () => {
                editorState3((d) => {
                  d.pendingDiffs = {
                    'a.js': makeDiff({ modifiedContent: 'changed' }),
                  };
                });
                return true;
              }),
            }),
            showNotification: showNotification3,
          }),
        );
        await flushAsync();
        expect(showNotification3).not.toHaveBeenCalled();
      });

      it('handles draft.pendingDiffs being undefined during final cancel update', async () => {
        const origEditor = makeEditorState({
          fileContents: { 'a.js': 'new' },
          pendingDiffs: { 'a.js': makeDiff() },
        });
        let callCount = 0;
        const proxyEditor = new Proxy(origEditor, {
          apply(_t, _thisArg, args: [(draft: ExtendedEditorState) => void]) {
            callCount++;
            if (callCount === 2) {
              origEditor((d) => {
                d.pendingDiffs = undefined as unknown as Record<string, PendingDiff>;
              });
            }
            origEditor(args[0]);
          },
        });

        cancelChangesShortcutAction(
          makeShortcutActionContext({
            tabState: makeTabState({ activeTabId: 'a.js' }),
            editorState: proxyEditor,
          }),
        );
        await flushAsync();
        expect(origEditor.fileContents['a.js']).toBe('old');
      });
    });
  });
});
