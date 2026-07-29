import { describe, expect, it } from 'vitest';
import { approveAllChangeSetChanges, undoAllChangeSetChanges } from './bulkActions';

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
});
