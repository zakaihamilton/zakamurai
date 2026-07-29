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
    expect(logState).toHaveBeenCalled();
  });

  it('logs rejected changes when validation fails', () => {
    const editorState = Object.assign((cb) => cb(editorState), {
      fileContents: {},
      pendingDiffs: {},
    });
    const logState = vi.fn((cb) => cb({ logs: [] }));

    applyAgentChanges([{ path: 'node_modules/react/index.js', before: '', after: 'modified' }], {
      editorState,
      logState,
    });

    expect(logState).toHaveBeenCalled();
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

    const changeSetState = Object.assign(
      vi.fn((updater) => updater(changeSetState)),
      {
        items: [],
        activeId: null,
      },
    );
    const { applied, deletions, changeSet } = applyAgentChanges(
      [
        { path: 'a.js', before: 'same', after: 'same' },
        { path: 'b.js', before: 'gone', after: undefined },
      ],
      { editorState, changeSetState },
    );

    expect(applied).toBe(0);
    expect(deletions).toEqual([{ path: 'b.js', before: 'gone' }]);
    expect(changeSet.files).toHaveLength(1);
    expect(changeSet.files[0].path).toBe('b.js');
  });

  it('does not create a change set when every accepted write is a no-op', () => {
    const editorState = Object.assign((cb) => cb(editorState), {
      fileContents: { 'a.js': 'same' },
      pendingDiffs: {},
    });
    const changeSetState = vi.fn();
    const result = applyAgentChanges([{ path: 'a.js', before: 'same', after: 'same' }], {
      editorState,
      changeSetState,
    });
    expect(result.changeSet).toBeNull();
    expect(changeSetState).not.toHaveBeenCalled();
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
