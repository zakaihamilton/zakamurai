import { describe, expect, it, vi } from 'vitest';
import {
  approveAllChangeSetChanges,
  rewindToChangeSetCheckpoint,
  undoAllChangeSetChanges,
} from './bulkActions';

function store<T extends object>(initial: T) {
  const state = Object.assign((updater: (draft: T) => void) => updater(state), initial);
  return state;
}

const changeSet = () =>
  store({
    items: [
      {
        id: 'cs-1',
        status: 'pending-review',
        files: [
          { path: 'a.js', status: 'pending-review' },
          { path: 'old.js', status: 'pending-review' },
        ],
      },
    ],
  });

describe('bulk AI change-set actions', () => {
  it('approves every pending edit and deletion in the active change set', async () => {
    const editorState = store({
      fileContents: { 'a.js': 'new', 'old.js': 'old' },
      pendingDiffs: {
        'a.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
      },
      pendingDeletions: { 'old.js': { originalContent: 'old', changeSetId: 'cs-1' } },
    });
    const changeSetState = changeSet();

    await expect(
      approveAllChangeSetChanges({ changeSetId: 'cs-1', editorState, changeSetState }),
    ).resolves.toEqual({ applied: 2, rejected: 0, conflicted: 0 });

    expect(editorState.pendingDiffs).toEqual({});
    expect(editorState.pendingDeletions).toEqual({});
    expect(editorState.fileContents).toEqual({ 'a.js': 'new' });
    expect(changeSetState.items[0].status).toBe('reviewed');
  });

  it('undoes every pending edit and deletion in the active change set', async () => {
    const editorState = store({
      fileContents: { 'a.js': 'new', 'old.js': 'old' },
      pendingDiffs: {
        'a.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
      },
      pendingDeletions: { 'old.js': { originalContent: 'old', changeSetId: 'cs-1' } },
    });
    const changeSetState = changeSet();

    await expect(
      undoAllChangeSetChanges({ changeSetId: 'cs-1', editorState, changeSetState }),
    ).resolves.toEqual({ applied: 0, rejected: 2, conflicted: 0 });

    expect(editorState.pendingDiffs).toEqual({});
    expect(editorState.pendingDeletions).toEqual({});
    expect(editorState.fileContents).toEqual({ 'a.js': 'old', 'old.js': 'old' });
    expect(changeSetState.items[0].status).toBe('reviewed');
  });

  it('keeps a pending edit when the mounted filesystem rejects the undo write', async () => {
    const editorState = store({
      fileContents: { 'a.js': 'new' },
      pendingDiffs: {
        'a.js': { originalContent: 'old', modifiedContent: 'new', changeSetId: 'cs-1' },
      },
      pendingDeletions: {},
    });
    const changeSetState = store({
      items: [
        {
          id: 'cs-1',
          status: 'pending-review',
          files: [{ path: 'a.js', status: 'pending-review' }],
        },
      ],
    });
    const writeFileAtPath = vi.fn().mockResolvedValue(false);

    await expect(
      undoAllChangeSetChanges({
        changeSetId: 'cs-1',
        editorState,
        changeSetState,
        fs: { rootHandle: {} as FileSystemDirectoryHandle, writeFileAtPath },
      }),
    ).resolves.toEqual({ applied: 0, rejected: 0, conflicted: 0 });

    expect(editorState.pendingDiffs['a.js']).toBeDefined();
    expect(editorState.fileContents['a.js']).toBe('new');
    expect(changeSetState.items[0].files[0].status).toBe('pending-review');
  });

  it('rewinds to a checkpoint and restores deleted files into the sidebar folder tree', async () => {
    const editorState = store<{
      fileContents: Record<string, string>;
      pendingDiffs: Record<string, unknown>;
      pendingDeletions: Record<string, unknown>;
    }>({
      fileContents: { 'src/keep.js': 'content' },
      pendingDiffs: {},
      pendingDeletions: {},
    });
    const sidebarState = store<{
      folderTree?: Array<{ name: string; type: string; children?: unknown[] }>;
    }>({
      folderTree: [{ name: 'src', type: 'folder', children: [{ name: 'keep.js', type: 'file' }] }],
    });
    const changeSetState = store({
      items: [
        {
          id: 'cs-0',
          files: [{ path: 'src/keep.js', originalContent: 'old-keep', proposedContent: 'content' }],
        },
        {
          id: 'cs-1',
          files: [
            { path: 'src/deleted.js', originalContent: 'restored-content', deleted: true },
            { path: 'src/created.js', originalContent: '', proposedContent: 'new-file' },
          ],
        },
      ],
      activeId: 'cs-1',
    });

    const result = await rewindToChangeSetCheckpoint({
      changeSetId: 'cs-1',
      editorState: editorState as never,
      changeSetState,
      sidebarState: sidebarState as never,
    });

    expect(result.restoredFiles).toBe(2);
    expect(editorState.fileContents['src/deleted.js']).toBe('restored-content');
    expect(editorState.fileContents['src/created.js']).toBeUndefined();
    expect(changeSetState.items.length).toBe(1);
    expect(changeSetState.activeId).toBe('cs-0');

    // Deleted file restored into folder tree
    const srcFolder = sidebarState.folderTree?.find((node) => node.name === 'src');
    expect(srcFolder?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'deleted.js', type: 'file' }),
        expect.objectContaining({ name: 'keep.js', type: 'file' }),
      ]),
    );
  });
});
