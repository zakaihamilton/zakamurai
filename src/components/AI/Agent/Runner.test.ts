import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent, AskWebLLM } from '../types';
import { runAgent } from './Runner';

vi.mock('../WebLLMAPI', () => ({ askWebLLM: vi.fn() }));

describe('runAgent', () => {
  let askWebLLM: Mock<AskWebLLM>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    ({ askWebLLM } = (await import('../WebLLMAPI')) as unknown as { askWebLLM: Mock<AskWebLLM> });
  });

  it('iterates through tools and returns isolated changes', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"read_file","path":"src/a.js"}')
      .mockResolvedValueOnce('{"action":"write_file","path":"src/a.js","content":"const a = 2;"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Updated a"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runAgent({
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

  it('recovers a todo app when the local model repeatedly reads an unchanged entry file', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.jsx"}')
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.jsx"}')
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.jsx"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');

    const result = await runAgent({
      request: 'create a todo app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      validate,
      model: 'test',
    });

    expect(result.summary).toContain('Created and validated the todo app');
    expect(result.files['src/App.jsx']).toContain('function addTask');
    expect(result.files['src/App.module.css']).toContain('--paper:');
    expect(validate).toHaveBeenCalledWith(result.files);
    expect(askWebLLM).toHaveBeenCalledTimes(3);
  });

  it('reports detailed streaming progress while waiting for a local-model action', async () => {
    askWebLLM.mockImplementationOnce(async (_prompt, _systemPrompt, onUpdate) => {
      onUpdate?.('{"action":"finish"');
      return '{"action":"finish","summary":"done"}';
    });
    const events: AgentEvent[] = [];

    await runAgent({
      request: 'inspect',
      files: { 'src/a.js': 'a' },
      model: 'test',
      onEvent: (event) => events.push(event),
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'thinking',
        message: expect.stringContaining('turn 1 of 30; 1 workspace file(s) available'),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'thinking',
        message: expect.stringContaining('streaming its next action (18 character(s) received)'),
      }),
    );
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

    await runAgent({
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

    const result = await runAgent({
      request: 'update the project',
      scope: 'project',
      activeFile: 'src/a.js',
      selectedLines: [1],
      files: { 'src/a.js': 'a1', 'src/b.js': 'b1' },
      model: 'test',
    });

    const initialPrompt = askWebLLM.mock.calls[0]?.[3]?.messages?.[1]?.content;
    expect(initialPrompt).toContain('Scope: whole project');
    expect(initialPrompt).not.toContain('Active file:');
    expect(initialPrompt).not.toContain('Selected lines:');
    expect(result.changes).toHaveLength(2);
  });

  it('rejects an inline CSS write before it becomes a visible staged draft', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default () => <main style={{ color: \'red\' }} />;"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"no changes"}');
    const events: AgentEvent[] = [];

    const result = await runAgent({
      request: 'style app',
      files: { 'src/App.jsx': 'export default () => <main />;' },
      model: 'test',
      onEvent: (event) => events.push(event),
    });

    expect(result.changes).toEqual([]);
    expect(
      events.some(
        (event) =>
          event.type === 'tool' &&
          typeof event.action === 'object' &&
          event.action.action === 'write_file',
      ),
    ).toBe(false);
    expect(events.some((event) => event.error && event.message?.includes('Inline CSS'))).toBe(true);
  });

  it('rejects a side-effect CSS Module import before it becomes a visible staged draft', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"import \\"./App.module.css\\"; export default () => <main className=\\"app\\" />;"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"no changes"}');
    const events: AgentEvent[] = [];

    const result = await runAgent({
      request: 'style app',
      files: { 'src/App.jsx': 'export default () => <main />;', 'src/App.module.css': '.app {}' },
      model: 'test',
      onEvent: (event) => events.push(event),
    });

    expect(result.changes).toEqual([]);
    expect(events.some((event) => event.error && event.message?.includes('default-imported'))).toBe(
      true,
    );
  });

  it('rejects raw CSS assigned to a JSX file before it becomes a visible staged draft', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/components/Task.jsx","content":".task { display: flex; }"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"no changes"}');
    const events: AgentEvent[] = [];

    const result = await runAgent({
      request: 'style task',
      files: { 'src/components/Task.jsx': 'export default function Task() { return null; }' },
      model: 'test',
      onEvent: (event) => events.push(event),
    });

    expect(result.changes).toEqual([]);
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

    const result = await runAgent({
      request: 'style todo',
      files: {},
      model: 'test',
      onEvent: (event) => events.push(event),
    });

    expect(result.changes).toEqual([]);
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

    await runAgent({
      request: 'style todo',
      files: {},
      model: 'test',
    });

    const repairMessage = askWebLLM.mock.calls[1]?.[3]?.messages
      ?.map((message: { content: string }) => message.content)
      .find((content: string) => content.includes('must write only'));
    expect(repairMessage).toContain('must write only src/components/Todo.module.css');
    expect(repairMessage).toContain('.app { display: block; }');
    expect(askWebLLM.mock.calls[1]?.[3]).toMatchObject({ max_tokens: 2400 });
  });

  it('gives malformed JSX source-specific recovery without mislabeling it as CSS', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default function App() { return <main />; }}"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"no changes"}');

    await runAgent({
      request: 'build app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test',
    });

    const repairMessage = askWebLLM.mock.calls[1]?.[3]?.messages
      ?.map((message: { content: string }) => message.content)
      .find((content: string) => content.includes('rejected source file'));
    expect(repairMessage).toContain('write only src/App.jsx');
    expect(repairMessage).toContain('using one jsx fence');
    expect(repairMessage).not.toContain('rejected stylesheet');
    expect(repairMessage).not.toContain('using one css fence');
    expect(askWebLLM.mock.calls[1]?.[3]).toMatchObject({ max_tokens: 2400 });
  });

  it('points an inline-style retry at an available co-located CSS Module', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default () => <main style={{ color: \'red\' }} />;"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"no changes"}');

    await runAgent({
      request: 'style app',
      files: {
        'src/App.jsx': 'export default () => <main />;',
        'src/App.module.css': '.app { color: red; }',
      },
      model: 'test',
    });

    const repairMessage = askWebLLM.mock.calls[1]?.[3]?.messages
      ?.map((message: { content: string }) => message.content)
      .find((content: string) => content.includes('rejected component'));
    expect(repairMessage).toContain('src/App.module.css is already available');
    expect(repairMessage).toContain('using one jsx source fence');
    expect(repairMessage).toContain('no style prop');
  });

  it('honors allowedActions, priorContext, and agentRole events', async () => {
    askWebLLM.mockResolvedValueOnce('{"action":"finish","summary":"done"}');
    const events: AgentEvent[] = [];
    const result = await runAgent({
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

  it('requires preview inspection before a visual review can finish', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"finish","summary":"premature"}')
      .mockResolvedValueOnce('{"action":"inspect_preview"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"reviewed"}');
    const inspectPreview = vi.fn().mockResolvedValue({ status: 'passed', visualEvidence: {} });

    const result = await runAgent({
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
      max_tokens: 2400,
    });
  });

  it('covers list/search/delete tools and recovers from one protocol failure', async () => {
    askWebLLM
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce('{"action":"search_workspace","query":"const"}')
      .mockResolvedValueOnce('{"action":"delete_file","path":"src/a.js","reason":"gone"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"cleaned"}');

    const result = await runAgent({
      request: 'cleanup',
      files: { 'src/a.js': 'const a = 1;', 'src/b.js': 'const b = 2;' },
      model: 'test',
    });

    expect(result.summary).toBe('cleaned');
    expect(
      result.changes.some((change) => change.path === 'src/a.js' && change.after === undefined),
    ).toBe(true);
  });

  it('includes filenames and action metadata in detailed reasoning observations', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"list_files","query":"src/"}')
      .mockResolvedValueOnce('{"action":"read_file","path":"src/components/Dashboard.jsx"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"inspected"}');
    const events: AgentEvent[] = [];

    await runAgent({
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

    const result = await runAgent({
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
      runAgent({
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
    const recovered = await runAgent({
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
      runAgent({
        request: 'loop',
        files: { 'src/a.js': 'a' },
        model: 'test',
        maxTurns: 6,
      }),
    ).rejects.toThrow(/despite recovery guidance/);

    askWebLLM.mockResolvedValue('{"action":"list_files"}');
    await expect(
      runAgent({
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
      .mockResolvedValueOnce(
        `{"action":"write_file","path":"src/components/TodoApp.module.css","content":${JSON.stringify(todoStyles)}}`,
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"Created the todo app"}');
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });
    const events: AgentEvent[] = [];

    const result = await runAgent({
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

    const result = await runAgent({
      request: 'create a pro todo app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test',
      validate,
    });

    expect(result.files['src/components/TodoApp.jsx']).toContain('function TodoApp');
    expect(validate).toHaveBeenCalledOnce();
  });

  it('requires a referenced CSS Module to exist before staging a component', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"import styles from \\"./App.module.css\\"; export default function App() { return <main className={styles.app} />; }"}',
      )
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.module.css","content":".app { display: block; }"}',
      )
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"import styles from \\"./App.module.css\\"; export default function App() { return <main className={styles.app} />; }"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}');
    const events: AgentEvent[] = [];

    const result = await runAgent({
      request: 'style the app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test',
      onEvent: (event) => events.push(event),
    });

    expect(result.files['src/App.module.css']).toContain('display: block');
    expect(events).toContainEqual(
      expect.objectContaining({
        error: true,
        message: expect.stringContaining('Missing CSS Module import'),
      }),
    );
    expect(
      askWebLLM.mock.calls[1]?.[3]?.messages?.some((message: { content: string }) =>
        message.content.includes('Create the missing co-located stylesheet now'),
      ),
    ).toBe(true);
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

    const result = await runAgent({
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

    const result = await runAgent({
      request: 'update app',
      files: {
        'src/App.jsx': 'export default function App() { return null; }',
        'src/App.module.css': '.app { display: block; }',
      },
      model: 'test',
      validate,
    });

    expect(result.summary).toContain('repeatedly read unchanged files');
    expect(validate).toHaveBeenCalledOnce();
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

    const result = await runAgent({
      request: 'create a pro todo app',
      files: { 'src/components/TodoApp.module.css': '' },
      model: 'test',
      validate,
    });

    expect(result.summary).toContain('repeated an identical write action');
    expect(result.files['src/components/TodoApp.module.css']).toBe(todoStyles);
    expect(validate).toHaveBeenCalledOnce();
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

    const result = await runAgent({
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
    const result = await runAgent({
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

  it('treats a missing file read as an actionable observation', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"read_file","path":"src/components/TaskList.module.css"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"no changes"}');
    const events: AgentEvent[] = [];

    await runAgent({
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
      runAgent({
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
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}');

    const events: AgentEvent[] = [];
    const validate = vi
      .fn()
      .mockResolvedValueOnce('failed checks')
      .mockResolvedValueOnce('failed checks')
      .mockResolvedValueOnce('failed checks')
      .mockResolvedValueOnce('Checks passed.');
    const result = await runAgent({
      request: 'repair',
      files: { 'src/a.js': 'a' },
      model: 'test',
      validate,
      onEvent: (event) => events.push(event),
    });

    expect(result.summary).toBe('done');
    expect(
      events.some((event) => event.message?.includes('Validation failed after 3 repair')),
    ).toBe(true);
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

    const result = await runAgent({
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
});
