import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindWebLLMStore } from '../WebLLMState';
import type { AgentEvent, AskWebLLM } from '../types';
import { runActionLoop } from './ActionLoop';

vi.mock('../WebLLMAPI', () => ({ askWebLLM: vi.fn() }));

const PLAYABLE_INTERACTIVE_APP = `import { useState } from "react";
export default function App() {
  const [items, setItems] = useState(["One", "Two", "Three"]);
  const [draft, setDraft] = useState("");
  const addItem = () => {
    if (!draft.trim()) return;
    setItems([...items, draft.trim()]);
    setDraft("");
  };
  return (
    <main>
      <h1>Notes</h1>
      <input value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button type="button" onClick={addItem}>
        Add
      </button>
      <div>
        {items.map((item) => (
          <button key={item} type="button" onClick={() => setItems(items.filter((value) => value !== item))}>
            {item}
          </button>
        ))}
      </div>
    </main>
  );
}
`;

const TIC_TAC_TOE_APP = `import { useState } from "react";
import styles from "./App.module.css";

const WINNING_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export default function App() {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [xIsNext, setXIsNext] = useState(true);
  const winner = WINNING_LINES.map(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c] ? board[a] : null).find(Boolean);
  const draw = !winner && board.every(Boolean);
  const play = (index) => {
    if (board[index] || winner) return;
    const nextBoard = [...board];
    nextBoard[index] = xIsNext ? "X" : "O";
    setBoard(nextBoard);
    setXIsNext(!xIsNext);
  };
  const reset = () => {
    setBoard(Array(9).fill(null));
    setXIsNext(true);
  };
  return (
    <main className={styles.app}>
      <h1 className={styles.title}>Tic Tac Toe</h1>
      <p className={styles.status}>{winner ? \`Winner: \${winner}\` : draw ? "Draw game" : \`\${xIsNext ? "X" : "O"}'s turn\`}</p>
      <div className={styles.board} role="grid">
        {board.map((cell, index) => <button className={styles.cell} key={index} type="button" onClick={() => play(index)}>{cell}</button>)}
      </div>
      <button className={styles.reset} type="button" onClick={reset}>Reset game</button>
    </main>
  );
}
`;

describe('runActionLoop', () => {
  let askWebLLM: Mock<AskWebLLM>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    bindWebLLMStore(null);
    ({ askWebLLM } = (await import('../WebLLMAPI')) as unknown as { askWebLLM: Mock<AskWebLLM> });
  });

  afterEach(() => {
    bindWebLLMStore(null);
    vi.useRealTimers();
  });

  it('iterates through tools and returns isolated changes', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"read_file","path":"src/a.js"}')
      .mockResolvedValueOnce('{"action":"write_file","path":"src/a.js","content":"const a = 2;"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Updated a"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');
    const result = await runActionLoop({
      request: 'update a',
      activeFile: 'src/a.js',
      files: { 'src/a.js': 'const a = 1;' },
      validate,
      model: 'test',
    });

    expect(validate).toHaveBeenCalledWith({ 'src/a.js': 'const a = 2;' });
    expect(result.changes[0].after).toBe('const a = 2;');
    expect(askWebLLM.mock.calls[0]?.[3]?.messages?.[1]?.content).toContain('Scope: current file');
    expect(askWebLLM.mock.calls[0]?.[3]?.requestKind).toBe('agent');
  });

  it('forces an edit after the model tries to finish without changes', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}')
      .mockResolvedValueOnce('{"action":"write_file","path":"src/a.js","content":"const a = 2;"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Updated a"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'update a',
      activeFile: 'src/a.js',
      files: { 'src/a.js': 'const a = 1;' },
      validate,
      model: 'test',
    });

    expect(result.files['src/a.js']).toBe('const a = 2;');
    expect(result.changes).toHaveLength(1);
  });

  it('forwards WebLLM metrics for each model turn', async () => {
    const onMetrics = vi.fn();
    askWebLLM.mockImplementationOnce(async (_prompt, _system, _update, options) => {
      options?.onMetrics?.({
        requestKind: 'agent',
        requestedModelId: 'test',
        modelId: 'test',
        outcome: 'success',
        startedAt: 1,
        totalMs: 20,
        recoveryCount: 0,
        promptTokens: 12,
        completionTokens: 4,
      });
      return '{"action":"finish","summary":"done"}';
    });

    await runActionLoop({
      request: 'inspect',
      files: { 'src/a.js': 'a' },
      model: 'test',
      onMetrics,
    });

    expect(onMetrics).toHaveBeenCalledWith(expect.objectContaining({ promptTokens: 12 }));
  });

  it('repairs a failed source file using its exact diagnostic before retrying the request', async () => {
    const brokenSource = 'export default function App() { return <main>Tic tac toe</main>;';
    const fixedSource = 'export default function App() { return <main>Tic tac toe</main>; }';
    const modelClient = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          action: 'write_file',
          path: 'src/App.jsx',
          content: brokenSource,
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          action: 'write_file',
          path: 'src/App.jsx',
          content: fixedSource,
        }),
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created tic tac toe"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create a tic tac toe game',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test',
      modelClient,
      validate,
    });

    expect(result.files['src/App.jsx']).toBe(fixedSource);
    expect(modelClient.mock.calls[1][0].messages[0].content).toContain(
      'repairing one failed source file',
    );
    expect(modelClient.mock.calls[1][0].messages[1].content).toContain("Unclosed '{'");
    expect(modelClient.mock.calls[1][0].messages[1].content).toContain('Tic tac toe');
    expect(validate).toHaveBeenCalledWith(result.files);
  });

  it('repairs the staged file after a build validation failure', async () => {
    const brokenSource = 'export default function App() { return <main>Build broken</main>; }';
    const fixedSource = 'export default function App() { return <main>Build fixed</main>; }';
    const modelClient = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          action: 'write_file',
          path: 'src/App.jsx',
          content: brokenSource,
        }),
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce(
        JSON.stringify({
          action: 'write_file',
          path: 'src/App.jsx',
          content: fixedSource,
        }),
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Fixed the app"}');
    const validate = vi
      .fn()
      .mockResolvedValueOnce({ status: 'failed', diagnostics: 'Build failed: missing export' })
      .mockResolvedValueOnce({ status: 'passed', check: 'build' });

    const result = await runActionLoop({
      request: 'fix the app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test',
      modelClient,
      validate,
    });

    expect(result.files['src/App.jsx']).toBe(fixedSource);
    expect(modelClient.mock.calls[2][0].messages[1].content).toContain(
      'Build failed: missing export',
    );
    expect(modelClient.mock.calls[2][0].messages[1].content).toContain('Build broken');
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('uses the injected model client for action turns', async () => {
    const modelClient = vi.fn().mockResolvedValue('{"action":"finish","summary":"done"}');

    const result = await runActionLoop({
      request: 'inspect',
      files: { 'src/a.js': 'a' },
      model: 'replay-model',
      modelClient,
    });

    expect(result.summary).toBe('done');
    expect(modelClient).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'replay-model', task: 'generate-changes' }),
    );
  });

  it('keeps direct kind changes responses as a compatibility fast path', async () => {
    const modelClient = vi.fn().mockResolvedValue(
      JSON.stringify({
        kind: 'changes',
        summary: 'Replayed edit',
        changes: [{ path: 'src/a.js', content: 'const a = 2;' }],
      }),
    );
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'update a',
      files: { 'src/a.js': 'const a = 1;' },
      model: 'replay-model',
      modelClient,
      validate,
    });

    expect(result.summary).toBe('Replayed edit');
    expect(result.files['src/a.js']).toBe('const a = 2;');
    expect(validate).toHaveBeenCalledWith(result.files);
  });

  it('rejects placeholder content before accepting a compatible direct response', async () => {
    const modelClient = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          summary: 'Placeholder',
          changes: [{ path: 'src/a.js', content: '// Your implementation goes here.' }],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          summary: 'Recovered edit',
          changes: [{ path: 'src/a.js', content: 'const a = 2;' }],
        }),
      );

    const result = await runActionLoop({
      request: 'update a',
      files: { 'src/a.js': 'const a = 1;' },
      model: 'replay-model',
      modelClient,
    });

    expect(result.files['src/a.js']).toBe('const a = 2;');
    expect(modelClient).toHaveBeenCalledTimes(2);
  });

  it('truncates oversized tool observations in the manager reasoning trace', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"inspected"}');
    const files = Object.fromEntries(
      Array.from({ length: 500 }, (_, index) => [
        `src/file-${index}.js`,
        'export const value = 1;',
      ]),
    );
    const events: AgentEvent[] = [];

    await runActionLoop({
      request: 'inspect',
      files,
      model: 'test',
      onEvent: (event) => events.push(event),
    });

    expect(events.some((event) => event.message?.includes('[tool result truncated'))).toBe(true);
  });

  it('reports empty list and search results clearly', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"list_files","query":"*.missing"}')
      .mockResolvedValueOnce('{"action":"search_workspace","query":"missing-token"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"inspected"}');
    const events: AgentEvent[] = [];

    await runActionLoop({
      request: 'inspect',
      files: { 'src/a.js': 'export const value = 1;' },
      model: 'test',
      onEvent: (event) => events.push(event),
    });

    expect(events.some((event) => event.message?.includes('No files found'))).toBe(true);
    expect(events.some((event) => event.message?.includes('No matches.'))).toBe(true);
  });

  it('forces an entry-file write after repeated unchanged reads for any request', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.jsx"}')
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.jsx"}')
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main>Tic tac toe</main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created tic tac toe"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');
    const result = await runActionLoop({
      request: 'create tic tac toe game',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      validate,
      model: 'test',
    });

    expect(result.files['src/App.jsx']).toContain('Tic tac toe');
    expect(
      askWebLLM.mock.calls[2]?.[3]?.messages?.some((message) =>
        message.content.includes('Your next response must be a write_file action for src/App.jsx'),
      ),
    ).toBe(true);
  });

  it('forces an entry-file write after varied inspection actions', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce('{"action":"list_files","query":"*.jsx"}')
      .mockResolvedValueOnce('{"action":"list_files","query":"*.tsx"}')
      .mockResolvedValueOnce('{"action":"list_files","query":"*.css"}')
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main>Tic tac toe</main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created tic tac toe"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create tic tac toe game',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      validate,
      model: 'test',
    });

    expect(result.files['src/App.jsx']).toContain('Tic tac toe');
    expect(
      askWebLLM.mock.calls[4]?.[3]?.messages?.some((message) =>
        message.content.includes('Your next response must be a write_file action for src/App.jsx'),
      ),
    ).toBe(true);
  });

  it('uses a compact prompt and earlier recovery for lightweight models', async () => {
    const modelClient = vi
      .fn()
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce(PLAYABLE_INTERACTIVE_APP)
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created notes app"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create a notes app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      validate,
      model: 'Qwen3.5-0.8B-q4f16_1-MLC',
      modelClient,
      priorContext: '[list_files]\nsrc/App.jsx\n[read_file]\nexisting app source',
    });

    expect(result.files['src/App.jsx']).toContain('Notes');
    expect(result.files['src/App.jsx']).toContain('useState');
    expect(modelClient.mock.calls[0][0].messages[0].content).toContain(
      'You are a small local coding model',
    );
    expect(modelClient.mock.calls[0][0].messages[0].content).toContain('labelled source fence');
    expect(modelClient.mock.calls[0][0].messages[1].content).toContain(
      'Your next response must be ONLY a labelled code fence with the complete source for src/App.jsx',
    );
    expect(modelClient.mock.calls[0][0].messages[1].content).toContain('--- src/App.jsx ---');
    expect(modelClient.mock.calls[0][0].messages[1].content).not.toContain('[list_files]');
    expect(modelClient.mock.calls[1][0].messages[0].content).toContain('emergency write mode');
    expect(modelClient.mock.calls[1][0].messages[0].content).toContain(
      'Reply with ONLY this labelled code fence',
    );
    expect(modelClient.mock.calls[1][0].messages[0].content).not.toContain(
      '{"action":"write_file"',
    );
  });

  it('uses a compact prompt when forced write recovery is activated', async () => {
    const modelClient = vi
      .fn()
      .mockResolvedValueOnce('{"action":"list_files","query":"*.jsx"}')
      .mockResolvedValueOnce('{"action":"list_files","query":"*.tsx"}')
      .mockResolvedValueOnce('{"action":"list_files","query":"*.css"}')
      .mockResolvedValueOnce('{"action":"list_files","query":"*.html"}')
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.jsx"}')
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main>Tic tac toe</main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created tic tac toe"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create tic tac toe game',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      validate,
      model: 'test',
      modelClient,
    });

    expect(result.files['src/App.jsx']).toContain('Tic tac toe');
    const recoveryMessages = modelClient.mock.calls[4][0].messages;
    expect(recoveryMessages).toHaveLength(2);
    expect(recoveryMessages[0].content).toContain('emergency write mode');
    expect(recoveryMessages[1].content).toContain('Original request: create tic tac toe game');
    expect(recoveryMessages[1].content).toContain('Current contents of src/App.jsx');
  });

  it('retries incomplete write_file metadata with fence-only recovery for 1.5B models', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","reason":"create a notes app"}',
      )
      .mockResolvedValueOnce(`\`\`\`jsx\n${PLAYABLE_INTERACTIVE_APP}\n\`\`\``)
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created notes app"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create a notes app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      validate,
      priorContext: '[list_files]\nsrc/App.jsx',
    });

    expect(result.files['src/App.jsx']).toContain('Notes');
    expect(result.files['src/App.jsx']).toContain('useState');
    const recoveryPrompt = askWebLLM.mock.calls[1]?.[3]?.messages
      ?.map((message: { content: string }) => message.content)
      .join('\n');
    expect(recoveryPrompt).toContain('Reply with ONLY this labelled code fence');
    expect(recoveryPrompt).toContain('```jsx');
    expect(recoveryPrompt).not.toContain('{"action":"write_file"');
    expect(recoveryPrompt).not.toContain('for example {"action":"list_files"}');
  });

  it('rejects a trivial 1.5B App shell and recovers with a playable implementation', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main><h1>Notes</h1></main>; }"}',
      )
      .mockResolvedValueOnce(`\`\`\`jsx\n${PLAYABLE_INTERACTIVE_APP}\n\`\`\``)
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created notes app"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');
    const events: AgentEvent[] = [];

    const result = await runActionLoop({
      request: 'create a notes app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      validate,
      priorContext: '[list_files]\nsrc/App.jsx',
      onEvent: (event) => events.push(event),
    });

    expect(result.files['src/App.jsx']).toContain('useState');
    expect(result.files['src/App.jsx']).toContain('onClick');
    expect(result.files['src/App.jsx']).toContain('App.module.css');
    expect(result.files['src/App.module.css']).toContain('.app');
    expect(result.files['src/App.module.css']).toContain('.button');
    expect(
      events.some((event) => event.error && event.message?.includes('only renders a heading')),
    ).toBe(true);
    expect(
      askWebLLM.mock.calls.some((call) =>
        call[3]?.messages?.some((message: { content?: string }) =>
          message.content?.includes('labelled code fence'),
        ),
      ),
    ).toBe(true);
  });

  it('strengthens repeated interactive repairs instead of accepting another heading-only file', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main><h1>Tic Tac Toe</h1></main>; }"}',
      )
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main><h1>Tic Tac Toe</h1></main>; }"}',
      )
      .mockResolvedValueOnce(`\`\`\`jsx\n${TIC_TAC_TOE_APP}\n\`\`\``)
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created tic tac toe"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create a tic tac toe game',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      validate,
    });

    expect(result.files['src/App.jsx']).toContain('useState');
    expect(result.files['src/App.jsx']).toContain('onClick');
    const repairPrompt = askWebLLM.mock.calls[1]?.[3]?.messages
      ?.map((message: { content: string }) => message.content)
      .join('\n');
    expect(repairPrompt).toContain('targeted item or cell by index');
    expect(repairPrompt).toContain('reset, clear, or restart control');
  });

  it('rejects an empty collection draft that only renders item controls', async () => {
    const incompleteCollection = `import React, { useState } from 'react';
export default function App() {
  const [todos, setTodos] = useState([]);
  const addTodo = (text) => setTodos([...todos, { text, completed: false }]);
  const toggleTodo = (index) => setTodos(todos.map((todo, itemIndex) => itemIndex === index ? { ...todo, completed: !todo.completed } : todo));
  const deleteTodo = (index) => setTodos(todos.filter((_, itemIndex) => itemIndex !== index));
  return <main><h1>Todo App</h1><ul>{todos.map((todo, index) => <li key={index}><input type="checkbox" checked={todo.completed} onChange={() => toggleTodo(index)} /><span>{todo.text}</span><button onClick={() => deleteTodo(index)}>Delete</button></li>)}</ul></main>;
}`;
    const incompleteFence = `\`\`\`jsx\n${incompleteCollection}\n\`\`\``;
    const completeFence = `\`\`\`jsx\n${PLAYABLE_INTERACTIVE_APP}\n\`\`\``;
    askWebLLM
      .mockResolvedValueOnce(incompleteFence)
      .mockResolvedValueOnce(completeFence)
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created todo app"}');
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });

    const result = await runActionLoop({
      request: 'build a todo app',
      activeFile: 'src/App.jsx',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      validate,
    });

    expect(result.files['src/App.jsx']).toContain('<input');
    expect(result.files['src/App.jsx']).toContain('>\n        Add\n      </button>');
    expect(
      askWebLLM.mock.calls[1]?.[3]?.messages?.some((message: { content?: string }) =>
        message.content?.includes('visible input or textarea'),
      ),
    ).toBe(true);
  });

  it('repairs generic turn guards and stale derived state before staging a lightweight app', async () => {
    const brokenInteractiveSource = `import { useState } from 'react';
export default function App() {
  const [board, setBoard] = useState(Array(4).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState('A');
  const checkStatus = () => board[0] || 'empty';
  const handleMove = (index) => {
    if (currentPlayer !== 'A') return;
    const nextBoard = [...board];
    nextBoard[index] = currentPlayer;
    setBoard(nextBoard);
    setCurrentPlayer(currentPlayer === 'A' ? 'B' : 'A');
    checkStatus();
  };
  return <button onClick={() => handleMove(0)}>{checkStatus()}</button>;
}`;
    askWebLLM
      .mockResolvedValueOnce(`\`\`\`jsx\n${brokenInteractiveSource}\n\`\`\``)
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created board app"}');
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });

    const result = await runActionLoop({
      request: 'create a turn-based board app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      validate,
    });

    expect(result.files['src/App.jsx']).not.toContain("currentPlayer !== 'A'");
    expect(result.files['src/App.jsx']).toContain('const checkStatus = (nextBoard = board)');
    expect(result.files['src/App.jsx']).toContain('checkStatus(nextBoard);');
  });

  it('finishes a complete staged app before a lightweight repair can regress it to a shell', async () => {
    askWebLLM
      .mockResolvedValueOnce(`\`\`\`jsx\n${TIC_TAC_TOE_APP}\n\`\`\``)
      .mockResolvedValueOnce(
        '```css\n.app { display: grid; }\n.board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }\n.cell { min-width: 0; min-height: 44px; }\n.reset { min-height: 44px; }\n```',
      )
      .mockResolvedValueOnce(
        '```jsx\nexport default function App() { return <main><h1>Tic Tac Toe</h1></main>; }\n```',
      );

    const result = await runActionLoop({
      request: 'create a tic tac toe game',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
    });

    expect(result.files['src/App.jsx']).toContain('useState');
    expect(result.files['src/App.jsx']).toContain('onClick');
    expect(result.files['src/App.module.css']).toContain('grid-template-columns');
    expect(askWebLLM).toHaveBeenCalledTimes(2);
  });

  it('auto-attaches a CSS Module when a lightweight model writes an unstyled interactive App', async () => {
    askWebLLM
      .mockResolvedValueOnce(`\`\`\`jsx\n${PLAYABLE_INTERACTIVE_APP}\n\`\`\``)
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created notes app"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create a notes app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      validate,
      priorContext: '[list_files]\nsrc/App.jsx',
    });

    expect(result.files['src/App.jsx']).toContain('import styles from "./App.module.css"');
    expect(result.files['src/App.jsx']).toContain('styles.button');
    expect(result.files['src/App.module.css']).toContain('.button');
    expect(result.files['src/App.module.css']).toContain('.list');
    expect(askWebLLM).toHaveBeenCalledOnce();
  });

  it('normalizes literal classes and generates complete generic recovery styles', async () => {
    const source = `import { useState } from 'react';
export default function App() {
  const [items, setItems] = useState(['One']);
  const [draft, setDraft] = useState('');
  const addItem = (event) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setItems([...items, draft.trim()]);
    setDraft('');
  };
  return <main className="todo-app"><h1 className="todo-title">Todo list</h1><form className="todo-form" onSubmit={addItem}><input className="todo-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a task" /><button className="todo-button" type="submit">Add</button></form><ul className="todo-list">{items.map((item) => <li className="todo-item" key={item}>{item}</li>)}</ul></main>;
}
`;
    askWebLLM
      .mockResolvedValueOnce(`\`\`\`jsx\n${source}\n\`\`\``)
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created todo list"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create a todo app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      validate,
      priorContext: '[list_files]\\nsrc/App.jsx',
    });

    expect(result.files['src/App.jsx']).toContain('styles["todo-app"]');
    expect(result.files['src/App.jsx']).not.toContain('className="todo-app"');
    expect(result.files['src/App.module.css']).toContain(':global(body)');
    expect(result.files['src/App.module.css']).toContain('.todo-app');
    expect(result.files['src/App.module.css']).toContain('.todo-item');
    expect(result.files['src/App.module.css']).toContain('display: grid');
  });

  it('completes an existing CSS Module when interactive controls have no classes', async () => {
    const source = `import { useState } from 'react';
import styles from './App.module.css';
export default function App() {
  const [draft, setDraft] = useState('');
  const [items, setItems] = useState([]);
  const addItem = (event) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setItems([...items, draft.trim()]);
    setDraft('');
  };
  return <main className={styles.app}><h1>Todo App</h1><form onSubmit={addItem}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a new todo" /><button type="submit">Add</button></form><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></main>;
}
`;
    askWebLLM
      .mockResolvedValueOnce(`\`\`\`jsx\n${source}\n\`\`\``)
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created todo app"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create a todo app',
      files: {
        'src/App.jsx': 'export default function App() { return null; }',
        'src/App.module.css': '.app { min-height: 100vh; background: #0f172a; }',
      },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      validate,
      priorContext: '[list_files]\nsrc/App.jsx\nsrc/App.module.css',
    });

    expect(result.files['src/App.jsx']).toContain('styles.control');
    expect(result.files['src/App.jsx']).toContain('styles.button');
    expect(result.files['src/App.module.css']).toContain('.control');
    expect(result.files['src/App.module.css']).toContain('.button');
  });

  it('preserves recovered control styles when the model writes the stylesheet afterward', async () => {
    const source = `import { useState } from 'react';
import styles from './App.module.css';
export default function App() {
  const [draft, setDraft] = useState('');
  const [items, setItems] = useState([]);
  const addItem = (event) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setItems([...items, draft.trim()]);
    setDraft('');
  };
  return <main className={styles.app}><h1>Todo App</h1><form onSubmit={addItem}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a new todo" /><button type="submit">Add</button></form><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></main>;
}
`;
    askWebLLM
      .mockResolvedValueOnce(
        JSON.stringify({ action: 'write_file', path: 'src/App.jsx', content: source }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          action: 'write_file',
          path: 'src/App.module.css',
          content: '.app { min-height: 100vh; background: #0f172a; }',
        }),
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created todo app"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create a todo app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      validate,
    });

    expect(result.files['src/App.module.css']).toContain(':global(button)');
    expect(result.files['src/App.module.css']).toContain('.control');
    expect(result.files['src/App.module.css']).toContain('.button');
  });

  it('rewrites generic lightweight finish summaries to mention the request', async () => {
    askWebLLM
      .mockResolvedValueOnce(`\`\`\`jsx\n${PLAYABLE_INTERACTIVE_APP}\n\`\`\``)
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"The project has been successfully built and validated. You can now proceed with further development or testing."}',
      );
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create a notes app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      validate,
      priorContext: '[list_files]\nsrc/App.jsx',
    });

    expect(result.summary).toContain('create a notes app');
    expect(result.summary).not.toContain('further development');
  });
  it('uses generic direct recovery when the local model never writes', async () => {
    const modelClient = vi
      .fn()
      .mockResolvedValueOnce('{"action":"list_files","query":"*.jsx"}')
      .mockResolvedValueOnce('{"action":"list_files","query":"*.tsx"}')
      .mockResolvedValueOnce('{"action":"list_files","query":"*.css"}')
      .mockResolvedValueOnce('{"action":"list_files","query":"*.html"}')
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.jsx"}')
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          summary: 'Created the dashboard.',
          changes: [
            {
              path: 'src/App.jsx',
              content: 'export default function App() { return <main>Dashboard</main>; }',
            },
          ],
        }),
      );
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });

    const result = await runActionLoop({
      request: 'create a dashboard',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      validate,
      model: 'test',
      modelClient,
    });

    expect(result.files['src/App.jsx']).toContain('Dashboard');
    expect(modelClient.mock.calls[5][0].messages[0].content).toContain('direct recovery mode');
    expect(modelClient.mock.calls[5][0].messages[1].content).toContain(
      'Original request: create a dashboard',
    );
    expect(validate).toHaveBeenCalledWith(result.files);
  });

  it('forces an entry-file write when validation repeats before any edit', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"inspect_preview"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main>Tic tac toe</main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created tic tac toe"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create tic tac toe game',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      validate,
      model: 'test',
    });

    expect(result.files['src/App.jsx']).toContain('Tic tac toe');
    expect(
      askWebLLM.mock.calls[4]?.[3]?.messages?.some((message) =>
        message.content.includes('Your next response must be a write_file action for src/App.jsx'),
      ),
    ).toBe(true);
  });

  it('keeps malformed output in forced recovery instead of allowing another inspection', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce('{"action":"list_files","query":"*.jsx"}')
      .mockResolvedValueOnce('{"action":"list_files","query":"*.tsx"}')
      .mockResolvedValueOnce('{"action":"list_files","query":"*.css"}')
      .mockResolvedValueOnce('{"action":"write_file"')
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main>Tic tac toe</main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created tic tac toe"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create tic tac toe game',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      validate,
      model: 'test',
    });

    expect(result.files['src/App.jsx']).toContain('Tic tac toe');
    expect(
      askWebLLM.mock.calls[5]?.[3]?.messages?.some((message) =>
        message.content.includes('Return exactly one write_file action for src/App.jsx'),
      ),
    ).toBe(true);
  });

  it('accepts the parser-safe fenced write format during forced recovery', async () => {
    const modelClient = vi
      .fn()
      .mockResolvedValueOnce('{"action":"list_files","query":"*.jsx"}')
      .mockResolvedValueOnce('{"action":"list_files","query":"*.tsx"}')
      .mockResolvedValueOnce('{"action":"list_files","query":"*.css"}')
      .mockResolvedValueOnce('{"action":"list_files","query":"*.html"}')
      .mockResolvedValueOnce(
        [
          '{"action":"write_file","path":"src/App.jsx","reason":"build calculator"}',
          '```jsx',
          'export default function App() { return <main>Calculator</main>; }',
          '```',
        ].join('\n'),
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"Created calculator"}');

    const result = await runActionLoop({
      request: 'build a calculator',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test',
      modelClient,
    });

    expect(result.files['src/App.jsx']).toContain('Calculator');
    expect(modelClient.mock.calls[4][0].messages[0].content).toContain('```jsx');
    expect(modelClient.mock.calls[4][0].messages[0].content).toContain(
      'Do not put source code in a JSON content field',
    );
  });

  it('stops early when a model ignores forced write recovery', async () => {
    askWebLLM.mockResolvedValue('{"action":"read_file","path":"src/App.jsx"}');

    await expect(
      runActionLoop({
        request: 'rename the application title',
        files: { 'src/App.jsx': 'export default function App() { return null; }' },
        model: 'test',
      }),
    ).rejects.toThrow(/including after a forced write recovery/);
    expect(askWebLLM).toHaveBeenCalledTimes(4);
  });

  it('queues a forced source write until the model provides its missing CSS Module', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.jsx"}')
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.jsx"}')
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"import styles from \\"./App.module.css\\"; export default function App() { return <main className={styles.app}>Game</main>; }"}',
      )
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.module.css","content":".app { display: grid; min-height: 100vh; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created game"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create a game',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      validate,
      model: 'test',
    });

    expect(result.files['src/App.jsx']).toContain('styles.app');
    expect(result.files['src/App.module.css']).toContain('display: grid');
    expect(validate).toHaveBeenCalledWith(result.files);
  });

  it('appends missing CSS module rules when source reuses an incomplete existing stylesheet', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"import styles from \\"./App.module.css\\"; export default function App() { return <div className={styles.container}><button className={`${styles.cell} ${styles.x}`}>X</button></div>; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created game"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create a game',
      files: {
        'src/App.jsx':
          'import styles from "./App.module.css"; export default function App() { return <div className={styles.container} />; }',
        'src/App.module.css':
          ':global(body) { margin: 0; }\n\n.container {\n  display: flex;\n  min-height: 100vh;\n}\n',
      },
      validate,
      model: 'test',
    });

    expect(result.files['src/App.module.css']).toContain('display: flex');
    expect(result.files['src/App.module.css']).toContain('.cell');
    expect(result.files['src/App.module.css']).toContain('.x');
    expect(result.files['src/App.module.css']).toContain('grid-template-columns: repeat(3');
    expect(validate).toHaveBeenCalledWith(result.files);
  });

  it('normalizes side-effect CSS imports into an atomic CSS Module change', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"import \'./App.css\'; export default function App() { return <main className=\\"game-container\\"><button className=\\"square\\">X</button></main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created game"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create a game',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      validate,
      model: 'test',
    });

    expect(result.files['src/App.jsx']).toContain("import styles from './App.module.css';");
    expect(result.files['src/App.jsx']).toContain('className={styles["game-container"]}');
    expect(result.files['src/App.module.css']).toContain('.game-container');
    expect(result.files['src/App.module.css']).toContain('.square');
    expect(validate).toHaveBeenCalledWith(result.files);
  });

  it('deduplicates a side-effect stylesheet when the module is already imported', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"import styles from \\"./App.module.css\\"; import \\"./App.css\\"; export default function App() { return <main className={styles.app}>Tic Tac Toe</main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created game"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create a game',
      files: {
        'src/App.jsx': 'export default function App() { return null; }',
        'src/App.module.css': '.app { display: block; }',
      },
      validate,
      model: 'test',
    });

    expect(result.files['src/App.jsx']).toContain('import styles from "./App.module.css";');
    expect(result.files['src/App.jsx']).not.toContain('import "./App.css"');
    expect(result.files['src/App.jsx'].match(/import styles from/g)).toHaveLength(1);
    expect(validate).toHaveBeenCalledWith(result.files);
  });

  it('converts a side-effect CSS Module import into the required class-map import', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"import \\"./App.module.css\\"; export default function App() { return <main className=\\"app\\">Tic Tac Toe</main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created game"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create a game',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      validate,
      model: 'test',
    });

    expect(result.files['src/App.jsx']).toContain('import styles from "./App.module.css";');
    expect(result.files['src/App.jsx']).not.toContain('import "./App.module.css"');
    expect(result.files['src/App.jsx']).toContain('className={styles.app}');
    expect(result.files['src/App.module.css']).toContain('.app');
    expect(validate).toHaveBeenCalledWith(result.files);
  });

  it('deduplicates repeated default CSS Module bindings before validation', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"import styles from \\"./App.module.css\\"; import styles from \\"./theme.module.css\\"; export default function App() { return <main className={styles.app}>Tic Tac Toe</main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created game"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create a game',
      files: {
        'src/App.jsx': 'export default function App() { return null; }',
        'src/App.module.css': '.app { display: block; }',
      },
      validate,
      model: 'test',
    });

    expect(result.files['src/App.jsx'].match(/import styles from/g)).toHaveLength(1);
    expect(validate).toHaveBeenCalledWith(result.files);
  });

  it('recovers a queued component with semantic CSS when the model ignores the stylesheet request', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"import styles from \\"./App.module.css\\"; export default function App() { return <main className={styles.app}><div className={styles.board}><button className={styles.square}>X</button></div></main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}');

    const result = await runActionLoop({
      request: 'create a game',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test',
    });

    expect(result.files['src/App.jsx']).toContain('styles.board');
    expect(result.files['src/App.module.css']).toContain('grid-template-columns: repeat(3');
    expect(result.files['src/App.module.css']).toContain('aspect-ratio: 1');
  });

  it('does not let a later minimal stylesheet overwrite recovered rules used by a component', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"import styles from \\"./App.module.css\\"; export default function App() { return <main className={styles.app}><div className={styles.board}><button className={styles.square}>X</button></div></main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.module.css","content":".app { display: block; }"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}');

    const result = await runActionLoop({
      request: 'create a game',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test',
    });

    expect(result.files['src/App.module.css']).toContain('grid-template-columns: repeat(3');
    expect(result.files['src/App.module.css']).toContain('aspect-ratio: 1');
  });

  it('reports detailed streaming progress while waiting for a local-model action', async () => {
    askWebLLM.mockImplementationOnce(async (_prompt, _systemPrompt, onUpdate) => {
      onUpdate?.('{"a');
      onUpdate?.('{"action":"finish"');
      return '{"action":"finish","summary":"done"}';
    });
    const events: AgentEvent[] = [];

    await runActionLoop({
      request: 'inspect',
      files: { 'src/a.js': 'a' },
      model: 'test',
      onEvent: (event) => events.push(event),
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'thinking',
        message: expect.stringMatching(
          /Reviewing the request and available workspace context|Requesting the next action from the local model/,
        ),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'thinking',
        message: expect.stringContaining('streaming its next action (3 character(s) received)'),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'thinking',
        message: expect.stringContaining('streaming its next action (18 character(s) received)'),
      }),
    );
  });

  it('reports model download progress while initialization is still underway', async () => {
    vi.useFakeTimers();
    const store = Object.assign(vi.fn(), {
      activeModelId: 'test',
      engines: { test: { status: 'downloading', progressText: 'Fetching model weights…' } },
    });
    bindWebLLMStore(store as never);
    askWebLLM.mockImplementationOnce(
      async (_prompt, _systemPrompt, _onUpdate, _options) =>
        new Promise((resolve) => {
          setTimeout(() => resolve('{"action":"finish","summary":"done"}'), 5_000);
        }),
    );
    const events: AgentEvent[] = [];
    const run = runActionLoop({
      request: 'inspect',
      files: { 'src/a.js': 'a' },
      model: 'test',
      onEvent: (event) => events.push(event),
    });

    await vi.advanceTimersByTimeAsync(3_000);

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'thinking',
        replaceProgress: true,
        message: expect.stringContaining('model is downloading — Fetching model weights'),
      }),
    );

    await vi.advanceTimersByTimeAsync(2_000);
    await expect(run).resolves.toMatchObject({ summary: 'done' });
  });

  it('forwards cancellation ownership and reports model recovery progress', async () => {
    askWebLLM.mockImplementationOnce(async (_prompt, _systemPrompt, _onUpdate, options) => {
      options?.onRecovery?.({
        requestedModelId: 'large',
        modelId: 'small',
        phase: 'initialization',
        action: 'fallback',
        reason: 'out-of-memory',
        attempt: 2,
      });
      return '{"action":"finish","summary":"done"}';
    });
    const controller = new AbortController();
    const events: AgentEvent[] = [];

    await runActionLoop({
      request: 'inspect',
      files: { 'src/a.js': 'a' },
      model: 'large',
      signal: controller.signal,
      onEvent: (event) => events.push(event),
    });

    expect(askWebLLM.mock.calls[0]?.[3]?.signal).toBe(controller.signal);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'thinking',
        message: expect.stringContaining('cached fallback small'),
      }),
    );
  });

  it('frames project scope without file or selection bias and edits multiple files', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"write_file","path":"src/a.js","content":"a2"}')
      .mockResolvedValueOnce('{"action":"write_file","path":"src/b.js","content":"b2"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Updated project"}');

    const result = await runActionLoop({
      request: 'update the project',
      scope: 'project',
      activeFile: 'src/a.js',
      selectedLines: [1],
      files: { 'src/a.js': 'a1', 'src/b.js': 'b1' },
      model: 'test',
    });

    const initialPrompt = askWebLLM.mock.calls[0]?.[3]?.messages?.[1]?.content;
    expect(initialPrompt).toContain('Scope: whole project');
    expect(initialPrompt).toContain(
      'Make at least one write_file or delete_file edit before using validate',
    );
    expect(initialPrompt).not.toContain('Active file:');
    expect(initialPrompt).not.toContain('Selected lines:');
    expect(result.changes).toHaveLength(2);
  });

  it('rejects prose paraphrases written as App.jsx and forces a source rewrite', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"Create the notes app"}',
      )
      .mockResolvedValueOnce(`\`\`\`jsx\n${PLAYABLE_INTERACTIVE_APP}\n\`\`\``)
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created notes app"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');
    const events: AgentEvent[] = [];

    const result = await runActionLoop({
      request: 'Create a notes app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      validate,
      priorContext: '[list_files]\nsrc/App.jsx',
      onEvent: (event) => events.push(event),
    });

    expect(result.files['src/App.jsx']).toContain('Notes');
    expect(result.files['src/App.jsx']).not.toContain('Create the notes app');
    expect(
      events.some((event) => event.error && event.message?.includes('not valid source code')),
    ).toBe(true);
    expect(askWebLLM.mock.calls[1]?.[3]?.messages?.[0]?.content).toContain('emergency write mode');
    expect(askWebLLM.mock.calls[1]?.[3]?.messages?.[0]?.content).toContain(
      'Reply with ONLY this labelled code fence',
    );
  });

  it('stops early when write_file oscillates between incomplete metadata and prose', async () => {
    const incomplete =
      '{"action":"write_file","path":"src/App.jsx","reason":"create a tic tac toe game"}';
    const prose =
      '{"action":"write_file","path":"src/App.jsx","content":"Create the tic tac toe game"}';
    askWebLLM
      .mockResolvedValueOnce(incomplete)
      .mockResolvedValueOnce(prose)
      .mockResolvedValueOnce(incomplete)
      .mockResolvedValueOnce(prose)
      .mockResolvedValueOnce(prose)
      .mockResolvedValueOnce(prose)
      .mockResolvedValueOnce(prose)
      .mockResolvedValue('{"action":"finish","summary":"should not reach"}');

    await expect(
      runActionLoop({
        request: 'create a tic tac toe game',
        files: { 'src/App.jsx': 'export default function App() { return null; }' },
        model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
        priorContext: '[list_files]\nsrc/App.jsx',
      }),
    ).rejects.toThrow(
      /repeatedly failed to write valid source|repeating the same action|forced write recovery/,
    );
    expect(askWebLLM.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(askWebLLM.mock.calls.length).toBeLessThan(12);
  });

  it('stops after repeated failed validations instead of looping write/validate/finish', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main>Broken</main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}')
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main>Broken</main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}')
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main>Broken</main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}');
    const validate = vi.fn().mockResolvedValue({
      status: 'failed',
      check: 'build',
      diagnostics: 'Build failed with 1 error',
    });

    await expect(
      runActionLoop({
        request: 'Create a tic tac toe game',
        files: { 'src/App.jsx': 'export default function App() { return null; }' },
        model: 'test',
        validate,
      }),
    ).rejects.toThrow(/Validation failed after (?:2 repair attempts|forced write recovery)/);
    expect(validate).toHaveBeenCalledTimes(2);
    expect(askWebLLM.mock.calls.length).toBeLessThanOrEqual(8);
  });

  it('does not ask the model to rewrite source for a local runtime validation failure', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main><h1>Todo</h1></main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created todo app"}');
    const validate = vi.fn().mockResolvedValue({
      status: 'failed',
      check: 'build',
      diagnostics:
        'Failed to fetch dynamically imported module: http://localhost:3000/lib/almostnode/index.mjs',
    });

    const result = await runActionLoop({
      request: 'create a todo app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test',
      validate,
    });

    expect(result.summary).toBe('Created todo app');
    expect(validate).toHaveBeenCalledOnce();
    expect(askWebLLM).toHaveBeenCalledTimes(3);
  });

  it('stops a lightweight model after two repeated validation failures', async () => {
    const source = 'export default function App() { return <main>Broken</main>; }';
    askWebLLM
      .mockResolvedValueOnce(
        `{"action":"write_file","path":"src/App.jsx","content":${JSON.stringify(source)}}`,
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}')
      .mockResolvedValueOnce(
        `{"action":"write_file","path":"src/App.jsx","content":${JSON.stringify(source)}}`,
      )
      .mockResolvedValueOnce('{"action":"validate"}');
    const validate = vi.fn().mockResolvedValue({
      status: 'failed',
      check: 'build',
      diagnostics: 'The symbol "styles" has already been declared.',
    });

    await expect(
      runActionLoop({
        request: 'style app',
        files: { 'src/App.jsx': 'export default function App() { return null; }' },
        model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
        validate,
      }),
    ).rejects.toThrow(/Validation failed after 2 repair attempts/);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('removes unsupported Vite config files before validate so browser builds can use defaults', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main>Ok</main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}');
    const validate = vi.fn().mockImplementation(async (files: Record<string, string>) => {
      if (Object.keys(files).some((path) => path.startsWith('vite.config'))) {
        return {
          status: 'failed',
          check: 'build',
          diagnostics: 'Browser builds do not execute vite.config.js.',
        };
      }
      return { status: 'passed', check: 'build', diagnostics: 'ok' };
    });
    const events: AgentEvent[] = [];

    const result = await runActionLoop({
      request: 'update app',
      files: {
        'src/App.jsx': 'export default function App() { return null; }',
        'vite.config.js': 'export default {}',
      },
      model: 'test',
      validate,
      onEvent: (event) => events.push(event),
    });

    expect(result.files['vite.config.js']).toBeUndefined();
    expect(
      result.changes.some(
        (change) => change.path === 'vite.config.js' && change.after === undefined,
      ),
    ).toBe(true);
    expect(validate).toHaveBeenCalled();
    expect(
      events.some(
        (event) =>
          event.type === 'tool' &&
          typeof event.action === 'object' &&
          event.action.action === 'delete_file' &&
          event.action.path === 'vite.config.js',
      ),
    ).toBe(true);
  });

  it('rewrites inline styles into a co-located CSS Module instead of rejecting the write', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default () => <main style={{ color: \'red\' }} />;"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"styled"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');
    const events: AgentEvent[] = [];

    const result = await runActionLoop({
      request: 'style app',
      files: { 'src/App.jsx': 'export default () => <main />;' },
      model: 'test',
      validate,
      onEvent: (event) => events.push(event),
    });

    expect(result.files['src/App.jsx']).toContain('className={styles.inline0}');
    expect(result.files['src/App.jsx']).not.toMatch(/\bstyle\s*=/);
    expect(result.files['src/App.module.css']).toContain('color: red');
    expect(
      events.some(
        (event) =>
          event.type === 'tool' &&
          typeof event.action === 'object' &&
          event.action.path === 'src/App.module.css',
      ),
    ).toBe(true);
  });

  it('normalizes a side-effect CSS Module import before staging the source', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"import \\"./App.module.css\\"; export default () => <main className=\\"app\\" />;"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"no changes"}');
    const events: AgentEvent[] = [];

    const result = await runActionLoop({
      request: 'style app',
      files: {
        'src/App.jsx': 'export default () => <main />;',
        'src/App.module.css': '.app {}',
      },
      model: 'test',
      onEvent: (event) => events.push(event),
    });

    expect(result.files['src/App.jsx']).toContain('import styles from "./App.module.css";');
    expect(result.files['src/App.jsx']).toContain('className={styles.app}');
    expect(result.files['src/App.jsx']).not.toContain('import "./App.module.css"');
    expect(events.some((event) => event.error && event.message?.includes('default-imported'))).toBe(
      false,
    );
  });

  it('rejects raw CSS assigned to a JSX file before it becomes a visible staged draft', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/components/Task.jsx","content":".task { display: flex; }"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"no changes"}');
    const events: AgentEvent[] = [];

    await expect(
      runActionLoop({
        request: 'style task',
        files: { 'src/components/Task.jsx': 'export default function Task() { return null; }' },
        model: 'test',
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toThrow(/could not provide a write_file action/);

    expect(events.some((event) => event.error && event.message?.includes('CSS content'))).toBe(
      true,
    );
  });

  it('rejects a cyclic CSS custom property before it becomes a visible staged draft', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/components/Todo.module.css","content":"--mobile-padding: var(--mobile-padding, 1rem);"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"no changes"}');
    const events: AgentEvent[] = [];

    await expect(
      runActionLoop({
        request: 'style todo',
        files: {},
        model: 'test',
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toThrow(/could not provide a write_file action/);

    expect(
      events.some((event) => event.error && event.message?.includes('cannot reference itself')),
    ).toBe(true);
  });

  it('gives a malformed stylesheet a path-specific, complete-rule recovery instruction', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/components/Todo.module.css","content":".todo { color: red;"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"no changes"}');

    await expect(
      runActionLoop({
        request: 'style todo',
        files: {},
        model: 'test',
      }),
    ).rejects.toThrow(/could not provide a write_file action/);

    const repairMessage = askWebLLM.mock.calls[1]?.[3]?.messages
      ?.map((message: { content: string }) => message.content)
      .find((content: string) => content.includes('must write only'));
    expect(repairMessage).toContain('must write only src/components/Todo.module.css');
    expect(repairMessage).toContain('.app { display: block; }');
    expect(askWebLLM.mock.calls[1]?.[3]).toMatchObject({
      max_tokens: 2600,
      contextWindowSize: 4096,
    });
  });

  it('gives malformed JSX source-specific recovery without mislabeling it as CSS', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main />; }}"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"no changes"}');

    await expect(
      runActionLoop({
        request: 'build app',
        files: { 'src/App.jsx': 'export default function App() { return null; }' },
        model: 'test',
      }),
    ).rejects.toThrow(/could not provide a write_file action/);

    const repairMessage = askWebLLM.mock.calls
      .flatMap((call) => call[3]?.messages || [])
      .map((message: { content: string }) => message.content)
      .find((content: string) => content.includes('rejected source file'));
    expect(repairMessage).toContain('write only src/App.jsx');
    expect(repairMessage).toContain('using one jsx fence');
    expect(repairMessage).not.toContain('rejected stylesheet');
    expect(repairMessage).not.toContain('using one css fence');
    expect(askWebLLM.mock.calls[1]?.[3]).toMatchObject({ contextWindowSize: 4096 });
    expect(askWebLLM.mock.calls[1]?.[3]?.max_tokens).toBeLessThanOrEqual(2600);
  });

  it('stops after repeated malformed source responses instead of exhausting the turn budget', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main><h1>Game</h1></main>; }}"}',
      )
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main><h1>Game</h1></main>; } } // retry"}',
      )
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main><h1>Game</h1></main>; }}"}',
      )
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main><h1>Game</h1></main>; } } // retry"}',
      )
      .mockResolvedValue('{"action":"finish","summary":"should not reach"}');

    await expect(
      runActionLoop({
        request: 'fix syntax in the game',
        files: { 'src/App.jsx': 'export default function App() { return null; }' },
        model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      }),
    ).rejects.toThrow(/repeatedly produced malformed source/);
    expect(askWebLLM.mock.calls.length).toBeLessThan(5);
  });

  it('rewrites dynamic inline styles with a safe co-located CSS Module fallback', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"const color = \'red\'; export default () => <main style={{ color }} />;"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"no changes"}');

    const result = await runActionLoop({
      request: 'style app',
      files: {
        'src/App.jsx': 'export default () => <main />;',
        'src/App.module.css': '.app { color: red; }',
      },
      model: 'test',
    });

    expect(result.files['src/App.jsx']).toContain('styles.inline0');
    expect(result.files['src/App.jsx']).not.toContain('style=');
    expect(result.files['src/App.module.css']).toContain('.inline0');
  });

  it('honors allowedActions, priorContext, and agentRole events', async () => {
    askWebLLM.mockResolvedValueOnce('{"action":"finish","summary":"done"}');
    const events: AgentEvent[] = [];
    const result = await runActionLoop({
      request: 'inspect',
      files: { 'src/a.js': 'a' },
      model: 'test',
      systemPrompt: 'planner only',
      allowedActions: ['list_files', 'read_file', 'finish'],
      priorContext: 'Plan: touch src/a.js',
      agentRole: 'planner',
      onEvent: (event) => events.push(event),
    });
    expect(result.summary).toBe('done');
    expect(askWebLLM.mock.calls[0]?.[3]?.messages?.[0]?.content).toBe('planner only');
    expect(askWebLLM.mock.calls[0]?.[3]?.messages?.[1]?.content).toContain(
      'Prior conversation context',
    );
    expect(events[0].agentRole).toBe('planner');
  });

  it('uses manager-provided context instead of asking the model to inspect again', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main>Reminders</main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}');

    const result = await runActionLoop({
      request: 'create a reminder app',
      files: {
        'src/App.jsx': 'export default function App() { return null; }',
        'src/utils/conventions.js': 'export const formatReminder = (value) => value.trim();',
      },
      model: 'test',
      priorContext:
        '[list_files]\nsrc/App.jsx\n\n[read_file {"path":"src/App.jsx"}]\nexisting app source\n\n[read_file {"path":"src/utils/conventions.js"}]\nexport const formatReminder = (value) => value.trim();',
    });

    expect(result.files['src/App.jsx']).toContain('Reminders');
    const prompt = askWebLLM.mock.calls[0]?.[3]?.messages?.[1]?.content;
    expect(prompt).toContain(
      'Your next response must be exactly one write_file action for src/App.jsx',
    );
    expect(prompt).toContain('The workspace has already been inspected');
    expect(prompt).toContain('--- src/App.jsx ---');
    expect(prompt).toContain('Manager-selected context');
    expect(prompt).toContain('src/utils/conventions.js');
    expect(prompt).toContain('formatReminder');
    expect(prompt).toContain('Project code contract:');
    expect(prompt).not.toContain('[read_file {"path":"src/App.jsx"}]');
    expect(prompt).not.toContain('[list_files]');
    expect(askWebLLM.mock.calls[0]?.[3]?.messages?.[0]?.content).toContain(
      'your next response must be exactly one write_file or',
    );
  });

  it('rejects transcript-shaped mixed source and recovers a complete Tic Tac Toe component', async () => {
    const malformed = `import ReactDOM from "react-dom/client";
const styles = { minHeight: "100vh", background: "#050505" };
export default function App() { return <main>broken</main>; }
ReactDOM.createRoot(document.getElementById("root")).render(<App />);`;
    askWebLLM
      .mockResolvedValueOnce(
        JSON.stringify({ action: 'write_file', path: 'src/App.jsx', content: malformed }),
      )
      .mockResolvedValueOnce(`\`\`\`jsx\n${TIC_TAC_TOE_APP}\n\`\`\``)
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created Tic Tac Toe"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create a tic tac toe game',
      activeFile: 'src/App.jsx',
      files: {
        'src/App.jsx': 'export default function App() { return null; }',
        'src/App.module.css': '.app {} .title {} .status {} .board {} .cell {} .reset {}',
        'src/components/AnimatedCard.jsx':
          'export default function AnimatedCard() { return null; }',
        'src/components/AnimatedCard.module.css': '.card {}',
      },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      priorContext: '[list_files]\nsrc/App.jsx\n[read_file]\nexisting workspace context',
      validate,
    });

    expect(result.files['src/App.jsx']).toContain('WINNING_LINES');
    expect(result.files['src/App.jsx']).toContain('onClick');
    expect(result.files['src/App.jsx']).toContain('Reset game');
    expect(result.files['src/App.jsx']).not.toContain('ReactDOM.createRoot');
    expect(result.files['src/App.jsx']).not.toContain('const styles = {');
    expect(result.files['src/App.module.css']).toContain('.cell');
    expect(askWebLLM.mock.calls[0]?.[3]?.messages?.[1]?.content).not.toContain(
      'Style reference: src/components/AnimatedCard.jsx',
    );
  });

  it('recovers after WebLLM reports an output-length stop before staging the response', async () => {
    askWebLLM.mockImplementationOnce(async (_prompt, _system, _update, options) => {
      options?.onMetrics?.({
        requestKind: 'agent',
        requestedModelId: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
        modelId: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
        outcome: 'success',
        startedAt: 1,
        totalMs: 20,
        recoveryCount: 0,
        finishReason: 'length',
        attempt: 1,
      });
      return '```jsx\nexport default function App() { return <main>truncated';
    });
    askWebLLM
      .mockResolvedValueOnce(`\`\`\`jsx\n${TIC_TAC_TOE_APP}\n\`\`\``)
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created Tic Tac Toe"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create a tic tac toe game',
      files: {
        'src/App.jsx': 'export default function App() { return null; }',
        'src/App.module.css': '.app {} .title {} .status {} .board {} .cell {} .reset {}',
      },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      validate,
    });

    expect(result.files['src/App.jsx']).toContain('WINNING_LINES');
    expect(askWebLLM.mock.calls[1]?.[3]?.messages?.[0]?.content).toContain('emergency write mode');
    expect(askWebLLM.mock.calls[1]?.[3]?.messages?.[0]?.content).toContain('one closed component');
  });

  it('forces a write after one redundant inspection when manager context is already ready', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main>Tic tac toe</main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created tic tac toe"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'create a tic tac toe game',
      files: {
        'src/App.jsx': 'export default function App() { return null; }',
        'package.json': '{"name":"app"}',
      },
      model: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
      validate,
      priorContext: '[list_files]\nsrc/App.jsx\n[read_file]\nexisting animated card source',
    });

    expect(result.files['src/App.jsx']).toContain('Tic tac toe');
    expect(askWebLLM.mock.calls[0]?.[3]?.messages?.[1]?.content).toContain(
      'Your next response must be exactly one write_file action for src/App.jsx',
    );
    expect(askWebLLM.mock.calls[1]?.[3]?.messages?.[0]?.content).toContain('emergency write mode');
    expect(askWebLLM.mock.calls[0]?.[3]).toMatchObject({
      max_tokens: 2000,
      contextWindowSize: 4096,
    });
  });

  it('requires preview inspection before a visual review can finish', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"finish","summary":"premature"}')
      .mockResolvedValueOnce('{"action":"inspect_preview"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"reviewed"}');
    const inspectPreview = vi.fn().mockResolvedValue({
      status: 'passed',
      elements: ['h1: Dashboard', 'button: Continue'],
      screenshotCaptured: true,
    });

    const result = await runActionLoop({
      request: 'review dashboard UI',
      files: { 'src/a.tsx': 'export {}' },
      model: 'test',
      visualMode: true,
      requirePreviewInspection: true,
      inspectPreview,
    });

    expect(result.summary).toBe('reviewed');
    expect(inspectPreview).toHaveBeenCalledOnce();
    expect(askWebLLM.mock.calls[0]?.[3]).toMatchObject({
      temperature: 0.12,
      top_p: 0.8,
      max_tokens: 2600,
      contextWindowSize: 4096,
    });
    expect(askWebLLM.mock.calls[0]?.[3]?.messages?.[1]?.content).toContain(
      'Visual quality is a hard requirement for UI requests',
    );
  });

  it('does not loop when a model alternates finish and validate before preview review', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"finish","summary":"premature"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"reviewed"}');
    const inspectPreview = vi.fn().mockResolvedValue({
      status: 'passed',
      elements: ['main: Dashboard', 'h1: Dashboard', 'button: Continue'],
      screenshotCaptured: true,
    });

    const result = await runActionLoop({
      request: 'review dashboard UI',
      files: { 'src/a.tsx': 'export {}' },
      model: 'test',
      visualMode: true,
      requirePreviewInspection: true,
      inspectPreview,
    });

    expect(result.summary).toBe('reviewed');
    expect(inspectPreview).toHaveBeenCalledOnce();
    expect(askWebLLM).toHaveBeenCalledTimes(3);
  });

  it('does not accept an empty passed preview as visual completion', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        JSON.stringify({
          action: 'write_file',
          path: 'src/App.jsx',
          content:
            'export default function App() { return <main><h1>Dashboard</h1><button>Save</button></main>; }',
        }),
      )
      .mockResolvedValueOnce('{"action":"inspect_preview"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"premature"}')
      .mockResolvedValueOnce('{"action":"inspect_preview"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"reviewed"}');
    const inspectPreview = vi
      .fn()
      .mockResolvedValueOnce({ status: 'passed', elements: [], screenshotCaptured: false })
      .mockResolvedValueOnce({
        status: 'passed',
        elements: ['main: Dashboard', 'h1: Dashboard', 'button: Save'],
        screenshotCaptured: true,
      });

    const result = await runActionLoop({
      request: 'update the dashboard UI',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test',
      validate: vi.fn().mockResolvedValue({ status: 'passed', check: 'build' }),
      inspectPreview,
      requirePreviewInspection: true,
    });

    expect(result.summary).toBe('reviewed');
    expect(inspectPreview).toHaveBeenCalledTimes(2);
  });

  it('covers list/search/delete tools and recovers from one protocol failure', async () => {
    askWebLLM
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce('{"action":"search_workspace","query":"const"}')
      .mockResolvedValueOnce('{"action":"delete_file","path":"src/a.js","reason":"gone"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"cleaned"}');

    const result = await runActionLoop({
      request: 'cleanup',
      files: { 'src/a.js': 'const a = 1;', 'src/b.js': 'const b = 2;' },
      model: 'test',
    });

    expect(result.summary).toBe('cleaned');
    expect(
      result.changes.some((change) => change.path === 'src/a.js' && change.after === undefined),
    ).toBe(true);
  });

  it('keeps a CSS Module that is still imported by an application component', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"delete_file","path":"src/App.module.css","reason":"replace styles"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"kept stylesheet"}');
    const events: AgentEvent[] = [];

    await expect(
      runActionLoop({
        request: 'replace styles',
        files: {
          'src/App.jsx':
            'import styles from "./App.module.css"; export default function App() { return <main className={styles.app} />; }',
          'src/App.module.css': '.app { display: block; }',
        },
        model: 'test',
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toThrow(/could not provide a write_file action/);

    expect(events).toContainEqual(
      expect.objectContaining({
        error: true,
        message: expect.stringContaining('Cannot delete CSS Module src/App.module.css'),
      }),
    );
  });

  it('includes filenames and action metadata in detailed reasoning observations', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"list_files","query":"src/"}')
      .mockResolvedValueOnce('{"action":"read_file","path":"src/components/Dashboard.jsx"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"inspected"}');
    const events: AgentEvent[] = [];

    await runActionLoop({
      request: 'inspect dashboard',
      files: {
        'src/App.jsx': 'export default function App() { return null; }',
        'src/components/Dashboard.jsx':
          'export default function Dashboard() { return <main>Dashboard</main>; }',
      },
      model: 'test',
      onEvent: (event) => events.push(event),
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'observation',
        action: expect.objectContaining({ action: 'list_files', query: 'src/' }),
        message: expect.stringContaining('src/components/Dashboard.jsx'),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'observation',
        action: expect.objectContaining({
          action: 'read_file',
          path: 'src/components/Dashboard.jsx',
        }),
        message: expect.stringContaining('Read src/components/Dashboard.jsx'),
      }),
    );
  });

  it('stages a fenced write payload from a local model', async () => {
    askWebLLM
      .mockResolvedValueOnce(`{"action":"write_file","path":"src/a.js"}
\`\`\`js
export const title = "Today";
\`\`\``)
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"created"}');
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });

    const result = await runActionLoop({
      request: 'create a todo app',
      files: { 'src/a.js': 'export const title = "Old";' },
      model: 'test',
      validate,
    });

    expect(result.files['src/a.js']).toBe('export const title = "Today";');
    expect(validate).toHaveBeenCalledOnce();
  });

  it('aborts when the signal is already set', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runActionLoop({
        request: 'stop',
        files: { 'src/a.js': 'a' },
        model: 'test',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(askWebLLM).not.toHaveBeenCalled();
  });

  it('recovers once from repeated actions and stops when recovery guidance is ignored', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"recovered"}');

    const events: AgentEvent[] = [];
    const recovered = await runActionLoop({
      request: 'loop',
      files: { 'src/a.js': 'a' },
      model: 'test',
      maxTurns: 5,
      onEvent: (event) => events.push(event),
    });
    expect(recovered.summary).toBe('recovered');
    expect(
      events.some(
        (event) =>
          !event.error &&
          event.message?.includes('Duplicate list_files skipped') &&
          event.message.includes('read-only action'),
      ),
    ).toBe(true);

    askWebLLM.mockReset();
    askWebLLM
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce('{"action":"list_files"}');

    await expect(
      runActionLoop({
        request: 'loop',
        files: { 'src/a.js': 'a' },
        model: 'test',
        maxTurns: 6,
      }),
    ).rejects.toThrow(/despite recovery guidance/);

    askWebLLM.mockResolvedValue('{"action":"list_files"}');
    await expect(
      runActionLoop({
        request: 'loop',
        files: { 'src/a.js': 'a' },
        model: 'test',
        maxTurns: 2,
      }),
    ).rejects.toThrow(/2-step safety limit/);
  });

  it('automatically validates a repeated saved write so the agent can finish', async () => {
    const todoStyles = '.app { color: rebeccapurple; }';
    askWebLLM
      .mockResolvedValueOnce(
        `{"action":"write_file","path":"src/components/TodoApp.module.css","content":${JSON.stringify(todoStyles)}}`,
      )
      .mockResolvedValueOnce(
        `{"action":"write_file","path":"src/components/TodoApp.module.css","content":${JSON.stringify(todoStyles)}}`,
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"Created the todo app"}');
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });
    const events: AgentEvent[] = [];

    const result = await runActionLoop({
      request: 'create a pro todo app',
      files: { 'src/components/TodoApp.module.css': '' },
      model: 'test',
      validate,
      onEvent: (event) => events.push(event),
    });

    expect(result.summary).toBe('Created the todo app');
    expect(result.files['src/components/TodoApp.module.css']).toBe(todoStyles);
    expect(validate).toHaveBeenCalledOnce();
    expect(events.some((event) => event.message?.includes('Automatically validating'))).toBe(true);
  });

  it('finishes after a redundant validate following automatic saved-write validation', async () => {
    const todoStyles = '.app { color: rebeccapurple; }';
    askWebLLM
      .mockResolvedValueOnce(
        `{"action":"write_file","path":"src/components/TodoApp.module.css","content":${JSON.stringify(todoStyles)}}`,
      )
      .mockResolvedValueOnce(
        `{"action":"write_file","path":"src/components/TodoApp.module.css","content":${JSON.stringify(todoStyles)}}`,
      )
      .mockResolvedValueOnce('{"action":"validate"}');
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });
    const inspectPreview = vi.fn().mockResolvedValue({
      status: 'passed',
      elements: ['main: Todo', 'h1: Todo', 'button: Add'],
      screenshotCaptured: true,
    });

    const result = await runActionLoop({
      request: 'create a pro todo app',
      files: { 'src/components/TodoApp.module.css': '' },
      model: 'test',
      validate,
      inspectPreview,
      requirePreviewInspection: true,
      visualMode: true,
    });

    expect(result.summary).toContain('Completed the requested changes and validated the build');
    expect(validate).toHaveBeenCalledOnce();
    expect(inspectPreview).toHaveBeenCalledOnce();
  });

  it('auto-finishes a repeated write after staging normalizes its content', async () => {
    const source = `export default function App() { return <main style={{ color: 'red' }}>Todo</main>; }`;
    askWebLLM
      .mockResolvedValueOnce(
        `{"action":"write_file","path":"src/App.jsx","content":${JSON.stringify(source)}}`,
      )
      .mockResolvedValueOnce(
        `{"action":"write_file","path":"src/App.jsx","content":${JSON.stringify(source)}}`,
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"Styled the todo app"}');
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });

    const result = await runActionLoop({
      request: 'style the todo app',
      files: { 'src/App.jsx': 'export default function App() { return <main />; }' },
      model: 'test',
      validate,
    });

    expect(result.summary).toBe('Styled the todo app');
    expect(result.files['src/App.jsx']).toContain('className={styles.inline0}');
    expect(result.files['src/App.module.css']).toContain('color: red');
    expect(validate).toHaveBeenCalledOnce();
    expect(askWebLLM).toHaveBeenCalledTimes(3);
  });

  it('does not auto-finish when repeated-write validation fails', async () => {
    const brokenSource = 'export default function App() { return <main>Broken</main>; }';
    askWebLLM
      .mockResolvedValueOnce(
        `{"action":"write_file","path":"src/App.jsx","content":${JSON.stringify(brokenSource)}}`,
      )
      .mockResolvedValueOnce(
        `{"action":"write_file","path":"src/App.jsx","content":${JSON.stringify(brokenSource)}}`,
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}')
      .mockResolvedValueOnce(
        `{"action":"write_file","path":"src/App.jsx","content":${JSON.stringify(brokenSource)}}`,
      )
      .mockResolvedValueOnce(
        `{"action":"write_file","path":"src/App.jsx","content":${JSON.stringify(brokenSource)}}`,
      );
    const validate = vi.fn().mockResolvedValue({
      status: 'failed',
      check: 'build',
      diagnostics: 'The symbol "styles" has already been declared.',
    });
    const events: AgentEvent[] = [];

    await expect(
      runActionLoop({
        request: 'create a tic tac toe game',
        files: { 'src/App.jsx': 'export default function App() { return null; }' },
        model: 'test',
        validate,
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toThrow(/Validation failed after (?:2 repair attempts|forced write recovery)/);
    expect(validate).toHaveBeenCalledTimes(2);
    expect(events.some((event) => event.type === 'finished')).toBe(false);
  });

  it('creates a new component file without treating its absence as a read error', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"import TodoApp from \\"./components/TodoApp\\"; export default function App() { return <TodoApp />; }"}',
      )
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/components/TodoApp.jsx","content":"export default function TodoApp() { return <main />; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Created the todo app"}');
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });

    const result = await runActionLoop({
      request: 'create a pro todo app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test',
      validate,
    });

    expect(result.files['src/components/TodoApp.jsx']).toContain('function TodoApp');
    expect(validate).toHaveBeenCalledOnce();
  });

  it('wires a newly-created default component into a scratch App when the model leaves it disconnected', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/components/Game.jsx","content":"export default function Game() { return <main>Tic Tac Toe</main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"Created the game"}');

    const result = await runActionLoop({
      request: 'create a game',
      files: {
        'src/App.jsx':
          'export default function App() { return <div><h1>New Project</h1><p>Start coding here...</p></div>; }',
      },
      model: 'test',
    });

    expect(result.files['src/App.jsx']).toContain('import Game from "./components/Game"');
    expect(result.files['src/App.jsx']).toContain('<Game />');
    expect(result.summary).toContain('Wired src/App.jsx');
  });

  it('host-generates a missing CSS Module when the component already binds styles', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"import styles from \\"./App.module.css\\"; export default function App() { return <main className={styles.app} />; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}');
    const events: AgentEvent[] = [];

    const result = await runActionLoop({
      request: 'style the app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test',
      validate: vi.fn().mockResolvedValue('Checks passed.'),
      onEvent: (event) => events.push(event),
    });

    expect(result.files['src/App.module.css']).toMatch(/\.app\s*\{/);
    expect(events.some((event) => String(event.message || '').includes('Queued src/App.jsx'))).toBe(
      false,
    );
  });

  it('stages a safe stylesheet after repeated malformed CSS writes', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.module.css","content":".app { color: red;"}',
      )
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.module.css","content":".app { color: blue;"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}');
    const events: AgentEvent[] = [];

    const result = await runActionLoop({
      request: 'style the app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test',
      onEvent: (event) => events.push(event),
    });

    expect(result.files['src/App.module.css']).toBe('.component {\n  display: block;\n}\n');
    expect(
      events.some((event) => event.message?.includes('safe minimal stylesheet was staged')),
    ).toBe(true);
  });

  it('validates and returns after the model repeatedly reads unchanged files', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main>Todos</main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.module.css"}')
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.jsx"}')
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.module.css"}')
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.jsx"}');
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });

    const result = await runActionLoop({
      request: 'update app',
      files: {
        'src/App.jsx': 'export default function App() { return null; }',
        'src/App.module.css': '.app { display: block; }',
      },
      model: 'test',
      validate,
    });

    expect(result.summary).toContain('Completed the requested changes and validated the build');
    expect(validate).toHaveBeenCalledOnce();
  });

  it('wires a scratch App before returning a component-only draft after repeated reads', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/components/Game.jsx","content":"export default function Game() { return <main>Tic Tac Toe</main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.jsx"}')
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.jsx"}')
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.jsx"}');
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });

    const result = await runActionLoop({
      request: 'create a game',
      files: {
        'src/App.jsx':
          'export default function App() { return <div><h1>New Project</h1><p>Start coding here...</p></div>; }',
      },
      model: 'test',
      validate,
    });

    expect(result.files['src/App.jsx']).toContain('import Game from "./components/Game"');
    expect(validate).toHaveBeenCalledWith(
      expect.objectContaining({ 'src/App.jsx': expect.stringContaining('<Game />') }),
    );
    expect(result.summary).toContain('wired src/App.jsx');
  });

  it('finishes with the validated draft when a saved write is repeated after automatic validation', async () => {
    const todoStyles = '.app { color: rebeccapurple; }';
    const write = `{"action":"write_file","path":"src/components/TodoApp.module.css","content":${JSON.stringify(todoStyles)}}`;
    askWebLLM
      .mockResolvedValueOnce(write)
      .mockResolvedValueOnce(write)
      .mockResolvedValueOnce(write)
      .mockResolvedValueOnce(write);
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });

    const result = await runActionLoop({
      request: 'create a pro todo app',
      files: { 'src/components/TodoApp.module.css': '' },
      model: 'test',
      validate,
    });

    expect(result.summary).toContain('Completed the requested changes and validated the build');
    expect(result.files['src/components/TodoApp.module.css']).toBe(todoStyles);
    expect(validate).toHaveBeenCalledOnce();
  });

  it('finishes after two consecutive validates instead of looping', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"import styles from \\"./App.module.css\\"; export default function App() { return <main className={styles.app}>Game</main>; }"}',
      )
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.module.css","content":".app { display: grid; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"validate"}');
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });

    const result = await runActionLoop({
      request: 'create a tic tac toe game',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test',
      validate,
    });

    expect(result.summary).toContain('Completed the requested changes and validated the build');
    expect(validate.mock.calls.length).toBeLessThanOrEqual(3);
    expect(askWebLLM.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('recovers missing CSS modules when auto-finishing after a validate loop', async () => {
    const app = `import styles from "./App.module.css";
export default function App() {
  return <div className={styles.container}><button className={styles.cell}>X</button></div>;
}`;
    askWebLLM
      .mockResolvedValueOnce(
        `{"action":"write_file","path":"src/App.jsx","content":${JSON.stringify(app)}}`,
      )
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.module.css","content":".container { display: flex; }"}',
      )
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"validate"}');
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });

    const result = await runActionLoop({
      request: 'create a game',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test',
      validate,
    });

    expect(result.files['src/App.module.css']).toContain('.cell');
    expect(result.summary).toContain('Completed the requested changes and validated the build');
  });

  it('labels an unwired multi-file draft as partial at the safety limit', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/components/TodoForm.jsx","content":"export default function TodoForm() { return <form />; }"}',
      )
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/components/TodoList.jsx","content":"export default function TodoList() { return <ul />; }"}',
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          action: 'write_file',
          path: 'src/components/TodoForm.jsx',
          content: 'export default function TodoForm() { return <form aria-label="New task" />; }',
        }),
      );
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });

    const result = await runActionLoop({
      request: 'create todo components',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test',
      maxTurns: 3,
      validate,
    });

    expect(result.summary).toContain('partial draft');
    expect(result.summary).toContain('without wiring them into the application entry point');
    expect(result.files['src/components/TodoForm.jsx']).toContain('New task');
    expect(result.files['src/components/TodoList.jsx']).toContain('<ul />');
    expect(validate).toHaveBeenCalledOnce();
  });

  it('recovers from tool errors and enforces validation before finish', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"read_file","path":"missing.js"}')
      .mockResolvedValueOnce('{"action":"write_file","path":"src/a.js","content":"next"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}');

    const events: AgentEvent[] = [];
    const validate = vi
      .fn()
      .mockResolvedValue({ status: 'passed', check: 'build', diagnostics: '' });
    const result = await runActionLoop({
      request: 'edit',
      files: { 'src/a.js': 'old' },
      model: 'test',
      validate,
      onEvent: (event) => events.push(event),
    });

    expect(result.summary).toBe('done');
    expect(events.some((event) => event.error)).toBe(false);
    expect(validate).toHaveBeenCalled();
  });

  it('forces a missing stylesheet write instead of looping finish and validate', async () => {
    const app = `import styles from './App.module.css';
export default function App() { return <main className={styles.app}>Todo</main>; }`;
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/notes.js","content":"export default 1;"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.module.css","content":".app { color: #292521; }"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}');
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });

    const result = await runActionLoop({
      request: 'edit the app',
      files: { 'src/App.jsx': app },
      model: 'test',
      validate,
    });

    expect(result.files['src/App.module.css']).toContain('.app');
    expect(result.summary).toBe('done');
    expect(askWebLLM).toHaveBeenCalledTimes(7);
  });

  it('treats a missing file read as an actionable observation', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"read_file","path":"src/components/TaskList.module.css"}')
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main />; }"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"created"}');
    const events: AgentEvent[] = [];

    await runActionLoop({
      request: 'create a todo app',
      files: { 'src/components/App.module.css': '' },
      model: 'test',
      onEvent: (event) => events.push(event),
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('create it with write_file'),
      }),
    );
    expect(
      askWebLLM.mock.calls[1]?.[3]?.messages?.some((message: { content: string }) =>
        message.content.includes('Do not read it again'),
      ),
    ).toBe(true);
  });

  it('retries malformed protocol replies before failing', async () => {
    askWebLLM
      .mockResolvedValueOnce('bad')
      .mockResolvedValueOnce('still bad')
      .mockResolvedValueOnce('still malformed')
      .mockResolvedValueOnce('not an action');
    await expect(
      runActionLoop({
        request: 'broken',
        files: { 'src/a.js': 'a' },
        model: 'test',
      }),
    ).rejects.toThrow(/could not follow the agent protocol/);
  });

  it('records validation repair failures as tool observations', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"write_file","path":"src/a.js","content":"v1"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce('{"action":"validate"}');

    const events: AgentEvent[] = [];
    const validate = vi.fn().mockResolvedValue('failed checks');
    await expect(
      runActionLoop({
        request: 'repair',
        files: { 'src/a.js': 'a' },
        model: 'test',
        validate,
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toThrow(/Validation failed after 2 repair attempts/);

    expect(validate).toHaveBeenCalledTimes(2);
    expect(
      events.filter(
        (event) =>
          event.type === 'tool' &&
          typeof event.action === 'object' &&
          event.action?.action === 'validate',
      ),
    ).toHaveLength(2);
  });

  it('covers semantic search, preview inspection, and project checks', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"search_semantic","query":"auth","k":2}')
      .mockResolvedValueOnce('{"action":"list_project_checks"}')
      .mockResolvedValueOnce('{"action":"run_project_check","check":"lint"}')
      .mockResolvedValueOnce('{"action":"inspect_preview"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"reviewed"}');

    const retrieveContext = vi
      .fn()
      .mockResolvedValue([{ filePath: 'src/a.js', content: 'auth', score: 1, linkedCss: [] }]);
    const inspectPreview = vi.fn().mockResolvedValue({ status: 'passed', diagnostics: 'ok' });
    const executeProjectCheck = vi.fn().mockResolvedValue('lint ok');
    const files = {
      'src/a.js': 'auth code',
      'package.json': JSON.stringify({ scripts: { lint: 'eslint .' } }),
    };

    const result = await runActionLoop({
      request: 'audit',
      files,
      model: 'test',
      retrieveContext,
      inspectPreview,
      runProjectCheck: executeProjectCheck,
    });

    expect(result.summary).toBe('reviewed');
    expect(retrieveContext).toHaveBeenCalled();
    expect(inspectPreview).toHaveBeenCalled();
    expect(executeProjectCheck).toHaveBeenCalledWith('lint', files);
  });

  it('validates staged changes when Qwen2.5-Coder recovery limit is reached with staged edits', async () => {
    const playableComponent = PLAYABLE_INTERACTIVE_APP.replace(
      'function App',
      'function NotesPanel',
    ).replace('<h1>Notes</h1>', '<h1>NotesPanel</h1>');
    askWebLLM
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce(
        JSON.stringify({
          action: 'write_file',
          path: 'src/components/NotesPanel.jsx',
          content: playableComponent,
        }),
      )
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.jsx"}')
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.jsx"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"validate"}');

    const validate = vi.fn().mockResolvedValue('Checks passed.');
    const result = await runActionLoop({
      request: 'Create a notes app',
      files: {
        'src/App.jsx':
          'export default function App() { return <div><h1>New Project</h1><p>Start coding here...</p></div>; }',
      },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      validate,
    });

    expect(result.files['src/App.jsx']).toContain(
      'import NotesPanel from "./components/NotesPanel"',
    );
    expect(result.files['src/components/NotesPanel.jsx']).toContain('NotesPanel');
    expect(validate).toHaveBeenCalled();
  });

  it('returns a validated draft when the bounded action limit is reached', async () => {
    askWebLLM.mockResolvedValueOnce(
      '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main>Draft</main>; }"}',
    );
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runActionLoop({
      request: 'update the app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      activeFile: 'src/App.jsx',
      model: 'test',
      validate,
      maxTurns: 1,
    });

    expect(result.summary).toContain('safety limit');
    expect(result.files['src/App.jsx']).toContain('Draft');
  });

  it('preserves staged changes when final safety-limit validation fails', async () => {
    askWebLLM.mockResolvedValueOnce(
      '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main>Draft</main>; }"}',
    );

    await expect(
      runActionLoop({
        request: 'update the app',
        files: { 'src/App.jsx': 'export default function App() { return null; }' },
        activeFile: 'src/App.jsx',
        model: 'test',
        validate: vi.fn().mockRejectedValue(new Error('final validation failed')),
        maxTurns: 1,
      }),
    ).rejects.toThrow('final validation failed');
  });

  it('wires a newly created component into a scratch entry at the safety limit', async () => {
    askWebLLM.mockResolvedValueOnce(
      '{"action":"write_file","path":"src/components/Widget.jsx","content":"export default function Widget() { return <div>Widget</div>; }"}',
    );

    const result = await runActionLoop({
      request: 'create a widget',
      files: {
        'src/App.jsx':
          'export default function App() { return <div><h1>New Project</h1><p>Start coding here...</p></div>; }',
      },
      model: 'test',
      validate: vi.fn().mockResolvedValue('Checks passed.'),
      maxTurns: 1,
    });

    expect(result.summary).toContain('wired');
    expect(result.files['src/App.jsx']).toContain('Widget');
  });

  it('gives a source write with invalid syntax and a missing CSS Module a targeted retry', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        JSON.stringify({
          action: 'write_file',
          path: 'src/App.jsx',
          content:
            "import styles from './App.module.css'; export default function App() { return <main className={styles.app}>",
        }),
      )
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main>Fixed</main>; }"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"Fixed the source."}');

    const result = await runActionLoop({
      request: 'fix the app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test',
    });

    expect(result.files['src/App.jsx']).toContain('Fixed');
  });

  it('supports replace_file_content action with SEARCH/REPLACE blocks', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        JSON.stringify({
          action: 'replace_file_content',
          path: 'src/App.jsx',
          search: 'return <div>Old</div>;',
          replace: 'return <div>New</div>;',
        }),
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"Updated App component"}');

    const result = await runActionLoop({
      request: 'update text in App',
      files: { 'src/App.jsx': 'export default function App() { return <div>Old</div>; }' },
      model: 'test',
    });

    expect(result.files['src/App.jsx']).toBe(
      'export default function App() { return <div>New</div>; }',
    );
  });

  it('supports get_file_symbols and manage_packages manager tools in action loop', async () => {
    askWebLLM
      .mockResolvedValueOnce(JSON.stringify({ action: 'get_file_symbols', path: 'src/App.jsx' }))
      .mockResolvedValueOnce(
        JSON.stringify({
          action: 'manage_packages',
          query: 'add',
          packageName: 'axios',
          version: '^1.0.0',
        }),
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"Inspected symbols and added package"}');

    const result = await runActionLoop({
      request: 'add axios package',
      files: {
        'src/App.jsx': 'export function App() { return null; }',
        'package.json': '{\n  "dependencies": {}\n}\n',
      },
      model: 'test',
    });

    expect(result.files['package.json']).toContain('"axios": "^1.0.0"');
  });

  it('auto-finishes lightweight models immediately after a repeated write passes validation', async () => {
    const todoAppSource = `import React, { useState } from 'react';
import styles from './App.module.css';

export default function App() {
  const [todos, setTodos] = useState([{ id: 1, text: 'First task', completed: false }]);
  const [input, setInput] = useState('');

  const handleAdd = () => {
    if (!input.trim()) return;
    setTodos([...todos, { id: Date.now(), text: input.trim(), completed: false }]);
    setInput('');
  };

  return (
    <main className={styles.app}>
      <h1>Todo App</h1>
      <div className={styles.control}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a new task..."
        />
        <button onClick={handleAdd}>Add Task</button>
      </div>
      <ul className={styles.list}>
        {todos.map((todo) => (
          <li key={todo.id}>{todo.text}</li>
        ))}
      </ul>
    </main>
  );
}`;
    const codeFence = `\`\`\`jsx\n${todoAppSource}\n\`\`\``;
    askWebLLM.mockResolvedValueOnce(codeFence).mockResolvedValueOnce(codeFence);

    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });

    const result = await runActionLoop({
      request: 'create a todo app',
      activeFile: 'src/App.jsx',
      files: {
        'src/App.jsx': 'export default function App() { return null; }',
        'src/App.module.css': '.app { display: block; }',
        'package.json': '{\n  "dependencies": {}\n}\n',
      },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      validate,
    });

    expect(result.summary).toContain('Completed the requested changes and validated the build');
    expect(result.files['src/App.jsx']).toContain('Todo App');
    expect(result.files['src/App.jsx']).toContain('styles.button');
    expect(validate).toHaveBeenCalledOnce();
    expect(askWebLLM).toHaveBeenCalledTimes(2);
  });

  it('recovers cleanly when model echoes raw validation JSON after automatic validation', async () => {
    const todoAppSource = `import React, { useState } from 'react';
import styles from './App.module.css';

export default function App() {
  const [todos, setTodos] = useState([{ id: 1, text: 'First task', completed: false }]);
  const [input, setInput] = useState('');

  const handleAdd = () => {
    if (!input.trim()) return;
    setTodos([...todos, { id: Date.now(), text: input.trim(), completed: false }]);
    setInput('');
  };

  return (
    <main className={styles.app}>
      <h1>Todo App</h1>
      <div className={styles.control}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a new task..."
        />
        <button onClick={handleAdd}>Add Task</button>
      </div>
      <ul className={styles.list}>
        {todos.map((todo) => (
          <li key={todo.id}>{todo.text}</li>
        ))}
      </ul>
    </main>
  );
}`;
    const writeJson = JSON.stringify({
      action: 'write_file',
      path: 'src/App.jsx',
      content: todoAppSource,
    });
    const echoedValidationJson = JSON.stringify({
      status: 'passed',
      check: 'build',
      diagnostics: ['Bundling complete. Generated /dist: index.html'],
    });

    askWebLLM
      .mockResolvedValueOnce(writeJson)
      .mockResolvedValueOnce(writeJson)
      .mockResolvedValueOnce(echoedValidationJson);

    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });

    const result = await runActionLoop({
      request: 'create a todo app',
      activeFile: 'src/App.jsx',
      files: {
        'src/App.jsx': 'export default function App() { return null; }',
        'src/App.module.css': '.app { display: block; }',
      },
      model: 'test-model',
      validate,
    });

    expect(result.summary).toContain('Completed the requested changes and validated the build');
    expect(result.files['src/App.jsx']).toContain('Todo App');
    expect(result.files['src/App.jsx']).toContain('styles.button');
  });

  it('auto-finishes lightweight model when it produces prose chatter after staging changes', async () => {
    const todoAppSource = `import React, { useState } from 'react';
import styles from './App.module.css';

export default function App() {
  const [todos, setTodos] = useState([{ id: 1, text: 'First task', completed: false }]);
  const [input, setInput] = useState('');

  const handleAdd = () => {
    if (!input.trim()) return;
    setTodos([...todos, { id: Date.now(), text: input.trim(), completed: false }]);
    setInput('');
  };

  return (
    <main className={styles.app}>
      <h1>Todo App</h1>
      <div className={styles.control}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a new task..."
        />
        <button onClick={handleAdd}>Add Task</button>
      </div>
      <ul className={styles.list}>
        {todos.map((todo) => (
          <li key={todo.id}>{todo.text}</li>
        ))}
      </ul>
    </main>
  );
}`;
    const codeFence = `\`\`\`jsx\n${todoAppSource}\n\`\`\``;

    askWebLLM
      .mockResolvedValueOnce(codeFence)
      .mockResolvedValueOnce('Completed the requested changes and built the todo app.');

    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });

    const result = await runActionLoop({
      request: 'create a todo app',
      activeFile: 'src/App.jsx',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      validate,
    });

    expect(result.summary).toContain('Completed the requested changes and validated the build');
    expect(result.files['src/App.jsx']).toContain('Todo App');
    expect(result.files['src/App.jsx']).toContain('styles.button');
    expect(validate).toHaveBeenCalledOnce();
  });
});
