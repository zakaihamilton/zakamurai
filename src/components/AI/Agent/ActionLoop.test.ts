import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent, AskWebLLM } from '../types';
import { runActionLoop } from './ActionLoop';

vi.mock('../WebLLMAPI', () => ({ askWebLLM: vi.fn() }));

describe('runActionLoop', () => {
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

  it('uses bounded todo recovery when the local model never produces a write', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"inspect_preview"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}');
    const validate = vi.fn().mockResolvedValue('Checks passed.');
    const events: AgentEvent[] = [];

    const result = await runActionLoop({
      request: 'create a todo app',
      files: {
        'src/App.jsx':
          'export default function App() { return <div><h1>New Project</h1><p>Start coding here...</p></div>; }',
      },
      model: 'test',
      validate,
      onEvent: (event) => events.push(event),
    });

    expect(result.files['src/App.jsx']).toContain('function addTask');
    expect(result.files['src/App.module.css']).toContain('.card');
    expect(validate).toHaveBeenCalledWith(result.files);
    expect(result.summary).toContain('bounded recovery');
    expect(
      events.filter(
        (event) =>
          event.type === 'tool' &&
          typeof event.action === 'object' &&
          event.action.action === 'validate',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provenance: 'model' }),
        expect.objectContaining({ provenance: 'recovery' }),
      ]),
    );
  });

  it('does not report todo recovery as successful when validation fails', async () => {
    askWebLLM.mockResolvedValueOnce('{"action":"finish","summary":"done"}');
    const validate = vi.fn().mockResolvedValue({
      status: 'failed',
      check: 'build',
      diagnostics: 'The generated app does not compile.',
    });

    await expect(
      runActionLoop({
        request: 'create a todo app',
        files: {
          'src/App.jsx':
            'export default function App() { return <div><h1>New Project</h1><p>Start coding here...</p></div>; }',
        },
        model: 'test',
        validate,
      }),
    ).rejects.toThrow(/Todo-app recovery validation failed/);
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
        message: 'Requesting the next action from the local model...',
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

  it('rejects an inline CSS write before it becomes a visible staged draft', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/App.jsx","content":"export default () => <main style={{ color: \'red\' }} />;"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"no changes"}');
    const events: AgentEvent[] = [];

    await expect(
      runActionLoop({
        request: 'style app',
        files: { 'src/App.jsx': 'export default () => <main />;' },
        model: 'test',
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toThrow(/could not provide a write_file action/);

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

    await expect(
      runActionLoop({
        request: 'style app',
        files: {
          'src/App.jsx': 'export default () => <main />;',
          'src/App.module.css': '.app {}',
        },
        model: 'test',
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toThrow(/could not provide a write_file action/);

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
    expect(askWebLLM.mock.calls[1]?.[3]).toMatchObject({ max_tokens: 2400 });
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

    await expect(
      runActionLoop({
        request: 'style app',
        files: {
          'src/App.jsx': 'export default () => <main />;',
          'src/App.module.css': '.app { color: red; }',
        },
        model: 'test',
      }),
    ).rejects.toThrow(/could not provide a write_file action/);

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

  it('requires preview inspection before a visual review can finish', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"finish","summary":"premature"}')
      .mockResolvedValueOnce('{"action":"inspect_preview"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"reviewed"}');
    const inspectPreview = vi.fn().mockResolvedValue({ status: 'passed', visualEvidence: {} });

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

  it('queues a component until its referenced CSS Module is written', async () => {
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

    const result = await runActionLoop({
      request: 'style the app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test',
      onEvent: (event) => events.push(event),
    });

    expect(result.files['src/App.module.css']).toContain('display: block');
    expect(events).toContainEqual(
      expect.objectContaining({
        error: true,
        message: expect.stringContaining('Queued src/App.jsx'),
      }),
    );
    expect(
      askWebLLM.mock.calls[1]?.[3]?.messages?.some((message: { content: string }) =>
        message.content.includes('must write src/App.module.css with the complete CSS Module'),
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

    expect(result.summary).toContain('repeatedly read unchanged files');
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

  it('treats a missing file read as an actionable observation', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"read_file","path":"src/components/TaskList.module.css"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"no changes"}');
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
    const result = await runActionLoop({
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
    askWebLLM
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce(
        '{"action":"write_file","path":"src/components/TicTacToe.jsx","content":"export default function TicTacToe() { return <div>TicTacToe</div>; }"}',
      )
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.jsx"}')
      .mockResolvedValueOnce('{"action":"read_file","path":"src/App.jsx"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"validate"}');

    const validate = vi.fn().mockResolvedValue('Checks passed.');
    const result = await runActionLoop({
      request: 'Create a tick tack toe game',
      files: {
        'src/App.jsx':
          'export default function App() { return <div><h1>New Project</h1><p>Start coding here...</p></div>; }',
      },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      validate,
    });

    expect(result.files['src/App.jsx']).toContain('import TicTacToe from "./components/TicTacToe"');
    expect(result.files['src/components/TicTacToe.jsx']).toContain('TicTacToe');
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
});
