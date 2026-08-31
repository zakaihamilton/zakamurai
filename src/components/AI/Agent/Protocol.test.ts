import { describe, expect, it } from 'vitest';
import {
  LIGHTWEIGHT_AGENT_SYSTEM_PROMPT,
  TODO_APP_GENERATION_GUIDANCE,
} from './ActionLoopRecovery';
import {
  AGENT_SYSTEM_PROMPT,
  ALL_AGENT_ACTIONS,
  RESPONSIVE_GENERATION_CONTRACT,
  normalizeAgentPath,
  parseAgentAction,
} from './Protocol';

describe('agent protocol', () => {
  it('documents every supported action in the system prompt catalog', () => {
    for (const action of ALL_AGENT_ACTIONS) {
      expect(AGENT_SYSTEM_PROMPT).toContain(`"action":"${action}"`);
    }
  });

  it('requires generated CSS Modules to use their exported class maps', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('className={styles.container}');
    expect(AGENT_SYSTEM_PROMPT).toContain('Never side-effect import *.module.css');
  });

  it('gives application interfaces a general visual direction instead of prompt-specific styling', () => {
    expect(AGENT_SYSTEM_PROMPT).not.toContain('warm editorial task planner');
    expect(AGENT_SYSTEM_PROMPT).toContain('CSS custom properties');
    expect(AGENT_SYSTEM_PROMPT).toContain('generic white card, system font, blue primary button');
  });

  it('gives lightweight models concrete todo behavior and visual direction', () => {
    expect(LIGHTWEIGHT_AGENT_SYSTEM_PROMPT).toContain('For interactive UI include React state');
    expect(TODO_APP_GENERATION_GUIDANCE).toContain('All/Active/Completed filter tabs');
    expect(TODO_APP_GENERATION_GUIDANCE).toContain('terracotta accent');
  });

  it('isolates generated preview colors from the host theme', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain(':global(:root)');
    expect(AGENT_SYSTEM_PROMPT).toContain(':global(body)');
    expect(AGENT_SYSTEM_PROMPT).toContain(':global(#root)');
    expect(AGENT_SYSTEM_PROMPT).toContain('WCAG AA contrast');
    expect(AGENT_SYSTEM_PROMPT).toContain(
      'never combine a dark background with default black text',
    );
  });

  it('defines a responsive contract for newly generated applications', () => {
    expect(RESPONSIVE_GENERATION_CONTRACT).toContain('320px, 375px, 768px, and 1440px');
    expect(RESPONSIVE_GENERATION_CONTRACT).toContain('minmax(0, 1fr)');
    expect(RESPONSIVE_GENERATION_CONTRACT).toContain('auto-fit');
    expect(RESPONSIVE_GENERATION_CONTRACT).toContain('flex-wrap');
    expect(RESPONSIVE_GENERATION_CONTRACT).toContain('min-width: 0');
    expect(RESPONSIVE_GENERATION_CONTRACT).toContain('clamp()');
    expect(RESPONSIVE_GENERATION_CONTRACT).toContain('square aspect-ratio containers');
    expect(AGENT_SYSTEM_PROMPT).toContain(RESPONSIVE_GENERATION_CONTRACT);
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
    expect(() => normalizeAgentPath('src/./App.jsx')).toThrow(/workspace/);
  });

  it('recovers unfenced source that follows write_file metadata', () => {
    expect(
      parseAgentAction(`{"action":"write_file","path":"src/App.jsx","reason":"build game"}
export default function App() {
  return <main>Tic Tac Toe</main>;
}`),
    ).toMatchObject({
      action: 'write_file',
      path: 'src/App.jsx',
      content: 'export default function App() {\n  return <main>Tic Tac Toe</main>;\n}',
    });
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

  it('accepts react-labelled fences and prefers them over empty JSON content', () => {
    expect(
      parseAgentAction(`{"action":"write_file","path":"src/App.jsx","content":"","reason":"build"}
\`\`\`react
import { useState } from "react";
export default function App() {
  const [board, setBoard] = useState(Array(9).fill(null));
  return <main>{board.map((cell, i) => <button key={i} onClick={() => setBoard(board)}>{cell}</button>)}</main>;
}
\`\`\``),
    ).toMatchObject({
      action: 'write_file',
      path: 'src/App.jsx',
      content: expect.stringContaining('useState'),
    });
  });

  it('prefers a complete source fence over a truncated JSON content field', () => {
    expect(
      parseAgentAction(`{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return null; }","reason":"build"}
\`\`\`jsx
import { useState } from "react";
export default function App() {
  const [value, setValue] = useState(0);
  return <button onClick={() => setValue(value + 1)}>{value}</button>;
}
\`\`\``),
    ).toMatchObject({
      action: 'write_file',
      path: 'src/App.jsx',
      content: expect.stringContaining('useState'),
    });
  });

  it('recovers fence-only source when a default write path is supplied', () => {
    expect(
      parseAgentAction(
        `\`\`\`jsx
import { useState } from "react";
export default function App() {
  return <main>Ready</main>;
}
\`\`\``,
        { defaultWritePath: 'src/App.jsx' },
      ),
    ).toMatchObject({
      action: 'write_file',
      path: 'src/App.jsx',
      content: expect.stringContaining('export default function App'),
    });
  });

  it('does not mistake JSX action-named class values for loose protocol metadata', () => {
    const source = `import { useState } from 'react';
export default function App() {
  const [filter] = useState('all');
  return <button className={\`control \${filter === 'all' ? 'primaryAction' : 'secondaryAction'}\`}>Add</button>;
}`;

    expect(
      parseAgentAction(`\`\`\`jsx\n${source}\n\`\`\``, {
        defaultWritePath: 'src/App.jsx',
      }),
    ).toEqual({
      action: 'write_file',
      path: 'src/App.jsx',
      content: source,
    });
  });

  it('recovers raw source-only replies during targeted recovery', () => {
    expect(
      parseAgentAction(
        `export default function App() {
  return <main>Ready</main>;
}`,
        { defaultWritePath: 'src/App.jsx' },
      ),
    ).toMatchObject({
      action: 'write_file',
      path: 'src/App.jsx',
      content: expect.stringContaining('Ready'),
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

  it('rejects separately fenced metadata with an unfinished source fence', () => {
    expect(() =>
      parseAgentAction(`\`\`\`json
{"action":"write_file","path":"src/App.jsx"}
\`\`\`

\`\`\`jsx
export default function App() {
  return <main>Tasks</main>;
}`),
    ).toThrow(/content/);
  });

  it('rejects multiple source fences for the same destination', () => {
    expect(() =>
      parseAgentAction(`{"action":"write_file","path":"src/App.jsx"}
\`\`\`jsx
export default function App() { return <main>First</main>; }
\`\`\`
\`\`\`jsx
export default function App() { return <main>Second</main>; }
\`\`\``),
    ).toThrow(/exactly one source fence/);
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
