import { describe, expect, it, vi } from 'vitest';
import { applyAgentChanges } from './Applier';

describe('applyAgentChanges', () => {
  it('stages full-file writes as pendingDiffs without fuzzy matching', () => {
    const editorState = Object.assign(
      (cb) => {
        const draft = {
          fileContents: { 'src/App.js': 'const a = 1;\n' },
          pendingDiffs: {},
          cursorPos: {},
        };
        cb(draft);
        Object.assign(editorState, draft);
      },
      {
        fileContents: { 'src/App.js': 'const a = 1;\n' },
        pendingDiffs: {},
        cursorPos: {},
      },
    );
    const sidebarState = vi.fn((cb) => cb({ folderTree: [] }));
    const logState = vi.fn((cb) => cb({ logs: [] }));

    const { applied, deletions } = applyAgentChanges(
      [{ path: 'src/App.js', before: 'const a = 1;\n', after: 'const a = 2;\n' }],
      { editorState, sidebarState, logState },
    );

    expect(applied).toBe(1);
    expect(deletions).toEqual([]);
    expect(editorState.fileContents['src/App.js']).toBe('const a = 2;\n');
    expect(editorState.pendingDiffs['src/App.js'].originalContent).toBe('const a = 1;\n');
    expect(editorState.pendingDiffs['src/App.js'].modifiedContent).toBe('const a = 2;\n');
    expect(editorState.pendingDiffs['src/App.js'].diffs.length).toBeGreaterThan(0);
  });

  it('returns deletions separately and skips no-op writes', () => {
    const editorState = Object.assign(
      (cb) => {
        const draft = { fileContents: { 'a.js': 'same' }, pendingDiffs: {} };
        cb(draft);
        Object.assign(editorState, draft);
      },
      { fileContents: { 'a.js': 'same' }, pendingDiffs: {} },
    );

    const { applied, deletions } = applyAgentChanges(
      [
        { path: 'a.js', before: 'same', after: 'same' },
        { path: 'b.js', before: 'gone', after: undefined },
      ],
      { editorState },
    );

    expect(applied).toBe(0);
    expect(deletions).toEqual([{ path: 'b.js', before: 'gone' }]);
  });

  it('creates new files in the sidebar tree', () => {
    const editorState = Object.assign(
      (cb) => {
        const draft = { fileContents: {}, pendingDiffs: {}, cursorPos: {} };
        cb(draft);
        Object.assign(editorState, draft);
      },
      { fileContents: {}, pendingDiffs: {}, cursorPos: {} },
    );
    const tree = { folderTree: [] };
    const sidebarState = (cb) => cb(tree);

    applyAgentChanges([{ path: 'src/New.js', before: undefined, after: 'export default 1;\n' }], {
      editorState,
      sidebarState,
    });

    expect(editorState.fileContents['src/New.js']).toContain('export default 1');
    expect(tree.folderTree.find((n) => n.name === 'src')?.children?.[0]?.name).toBe('New.js');
  });
});
