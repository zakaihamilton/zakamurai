import type { FolderTreeNode, SidebarStateDraft } from '@/components/AI/types';
import {
  createEditorStateMock,
  createLogStateMock,
  createSidebarStateMock,
} from '@/test-utils/agentMocks';
import { makeChangeSetState } from '@/test-utils/stateMocks';
import { describe, expect, it } from 'vitest';
import { applyAgentChanges } from './Applier';

describe('applyAgentChanges', () => {
  it('stages full-file writes as pendingDiffs without fuzzy matching', () => {
    const editorState = createEditorStateMock({
      fileContents: { 'src/App.js': 'const a = 1;\n' },
      pendingDiffs: {},
      cursorPos: {},
    });
    const sidebarState = createSidebarStateMock({ folderTree: [] });
    const logState = createLogStateMock({ logs: [] });

    const { applied, deletions } = applyAgentChanges(
      [{ path: 'src/App.js', before: 'const a = 1;\n', after: 'const a = 2;\n' }],
      { editorState, sidebarState, logState },
    );

    expect(applied).toBe(1);
    expect(deletions).toEqual([]);
    expect(editorState.fileContents?.['src/App.js']).toBe('const a = 2;\n');
    expect(editorState.pendingDiffs?.['src/App.js']?.originalContent).toBe('const a = 1;\n');
    expect(editorState.pendingDiffs?.['src/App.js']?.modifiedContent).toBe('const a = 2;\n');
    expect(editorState.pendingDiffs?.['src/App.js']?.diffs.length).toBeGreaterThan(0);
    expect(logState).toHaveBeenCalled();
  });

  it('logs rejected changes when validation fails', () => {
    const editorState = createEditorStateMock({
      fileContents: {},
      pendingDiffs: {},
    });
    const logState = createLogStateMock({ logs: [] });

    applyAgentChanges([{ path: 'node_modules/react/index.js', before: '', after: 'modified' }], {
      editorState,
      logState,
    });

    expect(logState).toHaveBeenCalled();
  });

  it('returns deletions separately and skips no-op writes', () => {
    const editorState = createEditorStateMock({
      fileContents: { 'a.js': 'same' },
      pendingDiffs: {},
    });
    const changeSetState = makeChangeSetState({ items: [], activeId: null });

    const { applied, deletions, changeSet } = applyAgentChanges(
      [
        { path: 'a.js', before: 'same', after: 'same' },
        { path: 'b.js', before: 'gone', after: undefined },
      ],
      { editorState, changeSetState },
    );

    expect(applied).toBe(0);
    expect(deletions).toEqual([{ path: 'b.js', before: 'gone' }]);
    expect(changeSet?.files).toHaveLength(1);
    expect(changeSet?.files[0].path).toBe('b.js');
  });

  it('does not create a change set when every accepted write is a no-op', () => {
    const editorState = createEditorStateMock({
      fileContents: { 'a.js': 'same' },
      pendingDiffs: {},
    });
    const changeSetState = makeChangeSetState();
    const result = applyAgentChanges([{ path: 'a.js', before: 'same', after: 'same' }], {
      editorState,
      changeSetState,
    });
    expect(result.changeSet).toBeNull();
    expect(changeSetState).not.toHaveBeenCalled();
  });

  it('creates new files in the sidebar tree', () => {
    const editorState = createEditorStateMock({
      fileContents: {},
      pendingDiffs: {},
      cursorPos: {},
    });
    const tree: SidebarStateDraft = { folderTree: [] as FolderTreeNode[] };
    const sidebarState = createSidebarStateMock(tree);

    applyAgentChanges([{ path: 'src/New.js', before: undefined, after: 'export default 1;\n' }], {
      editorState,
      sidebarState,
    });

    expect(editorState.fileContents?.['src/New.js']).toContain('export default 1');
    expect(tree.folderTree?.find((n) => n.name === 'src')?.children?.[0]?.name).toBe('New.js');
  });

  it('applies initial project files without staging a review', () => {
    const editorState = createEditorStateMock({
      fileContents: {},
      pendingDiffs: {},
      cursorPos: {},
    });
    const changeSetState = makeChangeSetState();

    const { applied, changeSet } = applyAgentChanges(
      [{ path: 'src/App.js', before: undefined, after: 'export default function App() {}\n' }],
      { editorState, changeSetState, autoApprove: true },
    );

    expect(applied).toBe(1);
    expect(changeSet).toBeNull();
    expect(changeSetState).not.toHaveBeenCalled();
    expect(editorState.fileContents?.['src/App.js']).toContain('function App');
    expect(editorState.pendingDiffs).toEqual({});
  });
});
