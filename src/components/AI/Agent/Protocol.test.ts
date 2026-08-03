import { describe, expect, it } from 'vitest';
import { AGENT_SYSTEM_PROMPT, normalizeAgentPath, parseAgentAction } from './Protocol';

describe('agent protocol', () => {
  it('requires generated CSS Modules to use their exported class maps', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('className={styles.container}');
    expect(AGENT_SYSTEM_PROMPT).toContain('Never side-effect import *.module.css');
  });

  it('gives application interfaces a general visual direction instead of prompt-specific styling', () => {
    expect(AGENT_SYSTEM_PROMPT).not.toContain('warm editorial task planner');
    expect(AGENT_SYSTEM_PROMPT).toContain('CSS custom properties');
    expect(AGENT_SYSTEM_PROMPT).toContain('generic white card, system font, blue primary button');
  });

  it('requires new CSS Modules before the components that import them', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain(
      'write that complete *.module.css file before writing the importing JSX or TSX file',
    );
    expect(AGENT_SYSTEM_PROMPT).toContain('immediately write the named stylesheet');
  });

  it('stops the agent from re-inspecting supplied workspace context', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain(
      'When the request says that workspace context was already supplied',
    );
    expect(AGENT_SYSTEM_PROMPT).toContain('implement the request immediately');
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
