import type { FolderTreeNode, SidebarStateDraft } from '@/components/AI/types';
import {
  createEditorStateMock,
  createLogStateMock,
  createSidebarStateMock,
} from '@/test-utils/agentMocks';
import { makeChangeSetState } from '@/test-utils/stateMocks';
import { describe, expect, it } from 'vitest';
import { applyAgentChanges, ensureFileInTree, removeFileFromTree } from './Applier';

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

  it('does not remap traversal paths onto an existing project file', () => {
    const editorState = createEditorStateMock({
      fileContents: { 'src/App.js': 'const a = 1;\n' },
      pendingDiffs: {},
    });
    const logState = createLogStateMock({ logs: [] });

    const { applied, rejected } = applyAgentChanges(
      [{ path: '../App.js', before: 'const a = 1;\n', after: 'const a = 2;\n' }],
      { editorState, logState },
    );

    expect(applied).toBe(0);
    expect(rejected.length).toBeGreaterThan(0);
    expect(editorState.fileContents?.['src/App.js']).toBe('const a = 1;\n');
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
      fileContents: { 'src/App.js': 'export default function App() {}\n' },
      pendingDiffs: {
        'src/App.js': {
          originalContent: '',
          modifiedContent: 'export default function App() {}\n',
          diffs: [],
        },
      },
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

  it('auto-approves welcome writes into fileContents including new CSS Modules', () => {
    const starter = `export default function App() {
  return (
    <div>
      <h1>New Project</h1>
      <p>Start coding here...</p>
    </div>
  );
}`;
    const clock = `import { useState } from "react";
import styles from "./App.module.css";
export default function App() {
  const [time, setTime] = useState("00:00");
  const start = () => {
    setInterval(() => setTime("01:00"), 1000);
  };
  return (
    <main className={styles.app}>
      <h1 className={styles.title}>Round Clock</h1>
      <button className={styles.primaryAction} type="button" onClick={start}>Start</button>
    </main>
  );
}`;
    const editorState = createEditorStateMock({
      fileContents: { 'src/App.jsx': starter, 'src/main.jsx': 'import App from "./App";' },
      pendingDiffs: {},
      cursorPos: {},
    });
    const tree: SidebarStateDraft = {
      folderTree: [
        {
          name: 'src',
          type: 'folder',
          children: [
            { name: 'App.jsx', type: 'file' },
            { name: 'main.jsx', type: 'file' },
          ],
        },
      ],
    };
    const sidebarState = createSidebarStateMock(tree);

    const { applied } = applyAgentChanges(
      [
        { path: 'src/App.jsx', before: starter, after: clock },
        { path: 'src/App.module.css', before: undefined, after: '.app { display: grid; }\n' },
      ],
      { editorState, sidebarState, autoApprove: true },
    );

    expect(applied).toBe(2);
    expect(editorState.fileContents?.['src/App.jsx']).toContain('Round Clock');
    expect(editorState.fileContents?.['src/App.module.css']).toContain('.app');
    expect(editorState.pendingDiffs).toEqual({});
    const srcNode = tree.folderTree?.find((node) => node.name === 'src');
    expect(srcNode?.children?.some((child) => child.name === 'App.module.css')).toBe(true);
  });

  it('does not auto-approve any files when a sibling write is rejected', () => {
    const starter = `export default function App() {
  return (
    <div>
      <h1>New Project</h1>
    </div>
  );
}`;
    const invalidApp = `import { useState } from "react";
import styles from "./App.module.css";
export default function App() {
  const [todos, setTodos] = useState([]);
  return <button className={styles.primaryAction} type="button" onClick={() => setNewTodo('')}>Add</button>;
}`;
    const editorState = createEditorStateMock({
      fileContents: { 'src/App.jsx': starter },
      pendingDiffs: {},
      cursorPos: {},
    });
    const sidebarState = createSidebarStateMock({
      folderTree: [{ name: 'src', type: 'folder', children: [{ name: 'App.jsx', type: 'file' }] }],
    });

    const { applied, rejected } = applyAgentChanges(
      [
        { path: 'src/App.jsx', before: starter, after: invalidApp },
        {
          path: 'src/App.module.css',
          before: undefined,
          after: '.primaryAction { color: black; }\n',
        },
      ],
      { editorState, sidebarState, autoApprove: true },
    );

    expect(applied).toBe(0);
    expect(rejected.some((text) => /setNewTodo/.test(text))).toBe(true);
    expect(editorState.fileContents?.['src/App.jsx']).toBe(starter);
    expect(editorState.fileContents?.['src/App.module.css']).toBeUndefined();
  });

  it('stages accepted review writes when a sibling change is rejected', () => {
    const starter = 'export default function App() { return null; }\n';
    const validApp = `import styles from "./App.module.css";
export default function App() { return <main className={styles.app} />; }
`;
    const invalidHelper = `import { useState } from "react";
export default function Form() {
  const [todos, setTodos] = useState([]);
  return <button type="button" onClick={() => setNewTodo('')}>Add</button>;
}`;
    const editorState = createEditorStateMock({
      fileContents: { 'src/App.jsx': starter },
      pendingDiffs: {},
      cursorPos: {},
    });
    const changeSetState = makeChangeSetState({ items: [], activeId: null });

    const { applied, rejected, changeSet } = applyAgentChanges(
      [
        { path: 'src/App.jsx', before: starter, after: validApp },
        { path: 'src/Form.jsx', before: undefined, after: invalidHelper },
      ],
      { editorState, changeSetState },
    );

    expect(rejected.some((text) => /setNewTodo/.test(text))).toBe(true);
    expect(applied).toBe(1);
    expect(changeSet?.files.some((file) => file.path === 'src/App.jsx')).toBe(true);
    expect(editorState.fileContents?.['src/App.jsx']).toContain('styles.app');
    expect(editorState.fileContents?.['src/Form.jsx']).toBeUndefined();
  });

  it('ensureFileInTree immutably updates folderTree and auto-expands parent directories', () => {
    const sidebarState = createSidebarStateMock({ folderTree: [], expandedFolders: {} });
    const initialTreeRef = sidebarState.folderTree;

    ensureFileInTree(sidebarState, 'src/components/TodoForm.jsx');

    expect(sidebarState.folderTree).not.toBe(initialTreeRef);
    expect(sidebarState.expandedFolders).toEqual({
      src: true,
      'src/components': true,
    });
    const srcNode = sidebarState.folderTree?.find((n) => n.name === 'src');
    expect(srcNode?.type).toBe('folder');
    const compNode = srcNode?.children?.find((n) => n.name === 'components');
    expect(compNode?.type).toBe('folder');
    expect(compNode?.children?.find((n) => n.name === 'TodoForm.jsx')?.type).toBe('file');
  });

  it('removeFileFromTree immutably removes a file from folderTree', () => {
    const sidebarState = createSidebarStateMock({
      folderTree: [
        {
          name: 'src',
          type: 'folder',
          children: [{ name: 'Old.js', type: 'file' }],
        },
      ],
    });
    const initialTreeRef = sidebarState.folderTree;

    removeFileFromTree(sidebarState, 'src/Old.js');

    expect(sidebarState.folderTree).not.toBe(initialTreeRef);
    const srcNode = sidebarState.folderTree?.find((n) => n.name === 'src');
    expect(srcNode?.children).toHaveLength(0);
  });
});
