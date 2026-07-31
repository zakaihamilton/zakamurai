import { describe, expect, it } from 'vitest';
import { AGENT_SYSTEM_PROMPT, normalizeAgentPath, parseAgentAction } from './Protocol';

describe('agent protocol', () => {
  it('requires generated CSS Modules to use their exported class maps', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('className={styles.container}');
    expect(AGENT_SYSTEM_PROMPT).toContain('Never side-effect import *.module.css');
  });

  it('gives todo apps a specific visual direction instead of generic default styling', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('warm editorial task planner');
    expect(AGENT_SYSTEM_PROMPT).toContain('CSS custom properties');
    expect(AGENT_SYSTEM_PROMPT).toContain('generic white card, system font, blue primary button');
  });

  it('parses a JSON action from a fenced response', () => {
    expect(parseAgentAction('```json\n{"action":"read_file","path":"src/App.js"}\n```')).toEqual({
      action: 'read_file',
      path: 'src/App.js',
    });
  });

  it('rejects paths outside the workspace', () => {
    expect(() => normalizeAgentPath('../secret')).toThrow(/workspace/);
  });

  it('requires complete content for writes', () => {
    expect(() => parseAgentAction('{"action":"write_file","path":"a.js"}')).toThrow(/content/);
    expect(() => parseAgentAction('```json\n{"action":"write_file","path":"a.js"}\n```')).toThrow(
      /content/,
    );
  });

  it('parses a fenced source payload for writes without JSON escaping', () => {
    expect(
      parseAgentAction(`{"action":"write_file","path":"src/App.jsx","reason":"build UI"}
\`\`\`jsx
export default function App() {
  return <h1>Today's tasks</h1>;
}
\`\`\``),
    ).toEqual({
      action: 'write_file',
      path: 'src/App.jsx',
      reason: 'build UI',
      content: "export default function App() {\n  return <h1>Today's tasks</h1>;\n}",
    });
  });

  it('recovers the first complete action when source follows its JSON metadata', () => {
    expect(
      parseAgentAction(`{"action":"write_file","path":"src/App.jsx"}
\`\`\`jsx
export default function App() {
  return <main>{"Tasks"}</main>;
}
\`\`\``),
    ).toMatchObject({
      action: 'write_file',
      path: 'src/App.jsx',
      content: 'export default function App() {\n  return <main>{"Tasks"}</main>;\n}',
    });
  });

  it('accepts separately fenced metadata and an unfinished source fence', () => {
    expect(
      parseAgentAction(`\`\`\`json
{"action":"write_file","path":"src/App.jsx"}
\`\`\`

\`\`\`jsx
export default function App() {
  return <main>Tasks</main>;
}`),
    ).toMatchObject({
      action: 'write_file',
      path: 'src/App.jsx',
      content: 'export default function App() {\n  return <main>Tasks</main>;\n}',
    });
  });

  it('recovers loose single-quoted write metadata next to a source fence', () => {
    expect(
      parseAgentAction(`{action: 'write_file', path: 'src/App.jsx', reason: 'create app'}
\`\`\`jsx
export default function App() { return <main>Tasks</main>; }
\`\`\``),
    ).toMatchObject({
      action: 'write_file',
      path: 'src/App.jsx',
      content: 'export default function App() { return <main>Tasks</main>; }',
    });
  });

  it('uses the source fence matching the destination when a model emits multiple files', () => {
    expect(
      parseAgentAction(`{"action":"write_file","path":"src/components/TodoItem.jsx"}
\`\`\`jsx
export default function TodoItem() { return <li />; }
\`\`\`
\`\`\`css
.item { display: flex; }
\`\`\``),
    ).toMatchObject({
      action: 'write_file',
      path: 'src/components/TodoItem.jsx',
      content: 'export default function TodoItem() { return <li />; }',
    });
  });

  it('rejects a labeled source fence that does not match the destination extension', () => {
    expect(() =>
      parseAgentAction(`{"action":"write_file","path":"src/components/TodoItem.jsx"}
\`\`\`css
.item { display: flex; }
\`\`\``),
    ).toThrow(/content/);
  });

  it('parses search_semantic and requires a query', () => {
    expect(parseAgentAction('{"action":"search_semantic","query":"auth flow","k":3}')).toEqual({
      action: 'search_semantic',
      query: 'auth flow',
      k: 3,
    });
    expect(() => parseAgentAction('{"action":"search_semantic"}')).toThrow(/query/);
  });

  it('rejects actions outside the allowed set', () => {
    expect(() =>
      parseAgentAction('{"action":"write_file","path":"a.js","content":"x"}', {
        allowedActions: ['read_file', 'finish'],
      }),
    ).toThrow(/not allowed/);
  });
});
