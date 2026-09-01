import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runManager } from './ManagerRunner';

vi.mock('../WebLLMAPI', () => ({ askWebLLM: vi.fn() }));

describe('runManager', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executes a high-confidence workspace query without calling WebLLM', async () => {
    const { askWebLLM } = (await import('../WebLLMAPI')) as unknown as {
      askWebLLM: ReturnType<typeof vi.fn>;
    };
    const result = await runManager({
      request: 'list the files in src',
      files: { 'src/App.jsx': 'export default function App() {}', 'README.md': 'readme' },
      model: 'test-model',
    });

    expect(result.plan.modelRequired).toBe(false);
    expect(result.summary).toContain('src/App.jsx');
    expect(askWebLLM).not.toHaveBeenCalled();
  });

  it('keeps directory scopes for list-file requests', async () => {
    const result = await runManager({
      request: 'list the files in src',
      files: {
        'src/App.jsx': 'export default function App() {}',
        'src/components/Button.jsx': 'export default function Button() {}',
        'README.md': 'readme',
      },
      model: 'test-model',
    });

    expect(result.summary).toContain('src/App.jsx');
    expect(result.summary).toContain('src/components/Button.jsx');
    expect(result.summary).not.toContain('README.md');
  });

  it('executes build, read, and check-list requests without WebLLM', async () => {
    const { askWebLLM } = (await import('../WebLLMAPI')) as unknown as {
      askWebLLM: ReturnType<typeof vi.fn>;
    };
    const files = {
      'package.json': JSON.stringify({ scripts: { build: 'next build', test: 'vitest run' } }),
      'src/App.jsx': 'export default function App() {}',
    };

    const build = await runManager({ request: 'build the project', files, model: 'test-model' });
    const read = await runManager({ request: 'read package.json', files, model: 'test-model' });
    const checks = await runManager({
      request: 'which project checks are available',
      files,
      model: 'test-model',
    });

    expect(build.plan.modelRequired).toBe(false);
    expect(read.summary).toContain('vitest run');
    expect(checks.summary).toContain('build');
    expect(askWebLLM).not.toHaveBeenCalled();
  });

  it('preserves quoted search terms in deterministic workspace routing', async () => {
    const { askWebLLM } = (await import('../WebLLMAPI')) as unknown as {
      askWebLLM: ReturnType<typeof vi.fn>;
    };
    const result = await runManager({
      request: 'search for "answer"',
      files: { 'src/App.jsx': 'export const answer = 42;' },
      model: 'test-model',
    });
    expect(result.summary).toContain('src/App.jsx');
    expect(askWebLLM).not.toHaveBeenCalled();
  });

  it('preserves backtick-wrapped search terms in deterministic workspace routing', async () => {
    const { askWebLLM } = (await import('../WebLLMAPI')) as unknown as {
      askWebLLM: ReturnType<typeof vi.fn>;
    };
    const result = await runManager({
      request: 'search for `answer`',
      files: { 'src/App.jsx': 'export const answer = 42;' },
      model: 'test-model',
    });
    expect(result.summary).toContain('src/App.jsx');
    expect(askWebLLM).not.toHaveBeenCalled();
  });

  it('stages explicit model deletion proposals in the isolated workspace', async () => {
    const { askWebLLM } = (await import('../WebLLMAPI')) as unknown as {
      askWebLLM: ReturnType<typeof vi.fn>;
    };
    askWebLLM.mockResolvedValue(
      JSON.stringify({
        kind: 'changes',
        summary: 'Removed the old file.',
        changes: [{ path: 'src/old.js', delete: true }],
      }),
    );
    const result = await runManager({
      request: 'delete src/old.js',
      files: { 'src/old.js': 'export const old = true;' },
      model: 'test-model',
    });
    expect(result.files['src/old.js']).toBeUndefined();
    expect(result.changes).toEqual([
      { path: 'src/old.js', before: 'export const old = true;', after: undefined },
    ]);
  });

  it('uses the model only for generated changes and validates the result', async () => {
    const { askWebLLM } = (await import('../WebLLMAPI')) as unknown as {
      askWebLLM: ReturnType<typeof vi.fn>;
    };
    askWebLLM.mockResolvedValue(
      JSON.stringify({
        kind: 'changes',
        summary: 'Updated the title.',
        changes: [
          {
            path: 'src/App.jsx',
            content: 'export default function App() { return <h1>New</h1>; }',
          },
        ],
      }),
    );
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });
    const source = 'export default function App() { return <h1>Old</h1>; }';
    const result = await runManager({
      request: 'change the title',
      files: { 'src/App.jsx': source },
      activeFile: 'src/App.jsx',
      model: 'test-model',
      validate,
    });

    expect(result.changes[0]).toMatchObject({ path: 'src/App.jsx', before: source });
    expect(result.files['src/App.jsx']).toContain('New');
    expect(validate).toHaveBeenCalledWith(result.files);
    expect(askWebLLM).toHaveBeenCalledOnce();
  });

  it('reads bounded starter-file context for project edits without an active file', async () => {
    const modelClient = vi.fn().mockResolvedValue(
      JSON.stringify({
        kind: 'changes',
        summary: 'Implemented the todo app.',
        changes: [
          {
            path: 'src/App.jsx',
            content: 'export default function App() { return <main>Todo app</main>; }',
          },
        ],
      }),
    );
    const result = await runManager({
      request: 'create a todo app',
      files: {
        'package.json': '{"dependencies":{"react":"latest"}}',
        'src/App.jsx': 'export default function App() { return null; }',
        'src/main.jsx': "import App from './App.jsx';",
      },
      model: 'test-model',
      modelClient,
    });

    expect(result.files['src/App.jsx']).toContain('Todo app');
    expect(modelClient.mock.calls[0][0].messages[1].content).toContain(
      'export default function App() { return null; }',
    );
    expect(modelClient.mock.calls[0][0].messages[1].content).toContain(
      'Your next response must be exactly one write_file action for src/App.jsx',
    );
    expect(modelClient.mock.calls[0][0].messages[1].content).toContain('"react":"latest"');
    expect(modelClient.mock.calls[0][0].messages[1].content).toContain(
      "import App from './App.jsx';",
    );
    expect(modelClient.mock.calls[0][0].messages[1].content).toContain(
      'explicit import extensions',
    );
  });

  it('repairs a placeholder-only implementation before staging changes', async () => {
    const modelClient = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          summary: 'Implemented the todo app.',
          changes: [
            {
              path: 'src/App.jsx',
              content: '// Your implementation of the App.jsx file goes here.',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          summary: 'Implemented the todo app.',
          changes: [
            {
              path: 'src/App.jsx',
              content: 'export default function App() { return <main>Todo app</main>; }',
            },
          ],
        }),
      );

    const result = await runManager({
      request: 'create a todo app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      activeFile: 'src/App.jsx',
      model: 'test-model',
      modelClient,
    });

    expect(result.files['src/App.jsx']).toContain('Todo app');
    expect(result.files['src/App.jsx']).not.toContain('Your implementation');
    expect(modelClient).toHaveBeenCalledTimes(2);
    expect(modelClient.mock.calls[1][0].messages.at(-2).content).toContain('only a placeholder');
  });

  it('does not treat an answer-only edit response as a successful write', async () => {
    const modelClient = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ kind: 'answer', summary: 'The app is implemented.' }))
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          summary: 'Implemented the todo app.',
          changes: [{ path: 'src/App.jsx', content: 'export default function App() {}' }],
        }),
      );
    const result = await runManager({
      request: 'create a todo app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      activeFile: 'src/App.jsx',
      model: 'test-model',
      modelClient,
    });

    expect(result.files['src/App.jsx']).toBe('export default function App() {}');
    expect(result.changes).toEqual([
      {
        path: 'src/App.jsx',
        before: 'export default function App() { return null; }',
        after: 'export default function App() {}',
      },
    ]);
    expect(modelClient).toHaveBeenCalledTimes(2);
    expect(
      modelClient.mock.calls[1][0].messages.some((message: { content: string }) =>
        message.content.includes('return changes for an edit request'),
      ),
    ).toBe(true);
  });

  it('retries malformed edit responses before failing the run', async () => {
    const modelClient = vi
      .fn()
      .mockResolvedValueOnce('{"kind":"changes","changes":[{"path":"src/App.jsx"')
      .mockResolvedValueOnce('{"kind":"changes","changes":[{"path":"src/App.jsx"')
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          summary: 'Recovered edit.',
          changes: [{ path: 'src/App.jsx', content: 'export default function App() {}' }],
        }),
      );
    const result = await runManager({
      request: 'create a todo app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      model: 'test-model',
      modelClient,
    });

    expect(result.summary).toBe('Recovered edit.');
    expect(modelClient).toHaveBeenCalledTimes(3);
  });

  it('accepts an injected model client for deterministic replay', async () => {
    const { askWebLLM } = (await import('../WebLLMAPI')) as unknown as {
      askWebLLM: ReturnType<typeof vi.fn>;
    };
    const modelClient = vi.fn().mockResolvedValue(
      JSON.stringify({
        kind: 'answer',
        summary: 'Replayed answer',
      }),
    );
    const result = await runManager({
      request: 'explain the component',
      files: { 'src/App.jsx': 'export const answer = 42;' },
      model: 'replay-model',
      modelClient,
    });

    expect(result.summary).toBe('Replayed answer');
    expect(modelClient).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'replay-model', task: 'answer' }),
    );
    expect(askWebLLM).not.toHaveBeenCalled();
  });

  it('rejects unsafe model context requests instead of executing them', async () => {
    const { askWebLLM } = (await import('../WebLLMAPI')) as unknown as {
      askWebLLM: ReturnType<typeof vi.fn>;
    };
    askWebLLM.mockResolvedValue(
      JSON.stringify({
        kind: 'request-context',
        requests: [{ tool: 'read_file', input: { path: '../secrets.txt' } }],
      }),
    );

    await expect(
      runManager({
        request: 'explain the project',
        files: { 'src/App.jsx': 'x' },
        model: 'test-model',
      }),
    ).rejects.toThrow(/workspace|path/i);
  });

  it('handles deterministic preview and project-check branches', async () => {
    const inspectPreview = vi
      .fn()
      .mockResolvedValue({ status: 'passed', title: 'Current preview' });
    const runProjectCheck = vi.fn().mockResolvedValue('tests passed');
    const files = { 'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }) };
    const preview = await runManager({
      request: 'inspect the preview',
      files,
      model: 'test-model',
      inspectPreview,
    });
    const check = await runManager({
      request: 'run the tests',
      files,
      model: 'test-model',
      runProjectCheck,
    });
    expect(preview.summary).toContain('Current preview');
    expect(check.summary).toContain('tests passed');
    expect(inspectPreview).toHaveBeenCalled();
    expect(runProjectCheck).toHaveBeenCalledWith('test', files);
  });

  it('inspects the updated workspace for mixed preview requests', async () => {
    const { askWebLLM } = (await import('../WebLLMAPI')) as unknown as {
      askWebLLM: ReturnType<typeof vi.fn>;
    };
    askWebLLM.mockResolvedValue(
      JSON.stringify({
        kind: 'changes',
        summary: 'Updated the app.',
        changes: [{ path: 'src/App.jsx', content: 'export default function App() {}' }],
      }),
    );
    const validate = vi.fn().mockResolvedValue({ status: 'passed' });
    const inspectPreview = vi.fn().mockResolvedValue({
      status: 'passed',
      title: 'Updated preview',
      elements: ['h1: Updated app', 'button: Save'],
      screenshotCaptured: true,
    });
    const result = await runManager({
      request: 'change the app and inspect the preview',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      activeFile: 'src/App.jsx',
      model: 'test-model',
      validate,
      inspectPreview,
    });

    expect(result.plan.steps).toContainEqual(
      expect.objectContaining({ kind: 'tool', tool: 'inspect_preview' }),
    );
    expect(inspectPreview).toHaveBeenCalledWith(result.files);
    expect(result.summary).toContain('Updated preview');
  });

  it('returns semantic answers and allows bounded follow-up context', async () => {
    const { askWebLLM } = (await import('../WebLLMAPI')) as unknown as {
      askWebLLM: ReturnType<typeof vi.fn>;
    };
    askWebLLM
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'request-context',
          requests: [{ tool: 'read_file', input: { path: 'src/App.jsx' } }],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({ kind: 'answer', summary: 'The app exports the answer.' }),
      );
    const events: string[] = [];
    const result = await runManager({
      request: 'explain the component',
      files: { 'src/App.jsx': 'export const answer = 42;' },
      model: 'test-model',
      onEvent: (event) => events.push(event.type),
    });
    expect(result.summary).toContain('exports');
    expect(askWebLLM).toHaveBeenCalledTimes(2);
    expect(events).toContain('context');
  });

  it('rejects an empty follow-up context request', async () => {
    const { askWebLLM } = (await import('../WebLLMAPI')) as unknown as {
      askWebLLM: ReturnType<typeof vi.fn>;
    };
    askWebLLM.mockResolvedValue(JSON.stringify({ kind: 'request-context', requests: [] }));
    await expect(
      runManager({ request: 'explain the app', files: {}, model: 'test-model' }),
    ).rejects.toThrow(/no usable context/);
  });

  it('repairs invalid model changes within the bounded retry budget', async () => {
    const { askWebLLM } = (await import('../WebLLMAPI')) as unknown as {
      askWebLLM: ReturnType<typeof vi.fn>;
    };
    askWebLLM
      .mockResolvedValueOnce(
        JSON.stringify({ kind: 'changes', changes: [{ path: '../bad.js', content: 'bad' }] }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          summary: 'Repaired',
          changes: [
            {
              path: 'src/App.jsx',
              content: 'export default function App() { return <main>new</main>; }',
            },
          ],
        }),
      );
    const result = await runManager({
      request: 'change the app',
      files: { 'src/App.jsx': 'old' },
      activeFile: 'src/App.jsx',
      model: 'test-model',
    });
    expect(result.summary).toBe('Repaired');
    expect(result.changes[0]).toMatchObject({
      path: 'src/App.jsx',
      after: 'export default function App() { return <main>new</main>; }',
    });
    expect(askWebLLM).toHaveBeenCalledTimes(2);
  });

  it('repairs changes after a deterministic validation failure', async () => {
    const { askWebLLM } = (await import('../WebLLMAPI')) as unknown as {
      askWebLLM: ReturnType<typeof vi.fn>;
    };
    askWebLLM
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          changes: [
            {
              path: 'src/App.jsx',
              content: 'export default function App() { return <main>bad</main>; }',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          summary: 'Fixed build',
          changes: [
            {
              path: 'src/App.jsx',
              content: 'export default function App() { return <main>good</main>; }',
            },
          ],
        }),
      );
    const validate = vi
      .fn()
      .mockResolvedValueOnce({ status: 'failed', diagnostics: 'syntax error' })
      .mockResolvedValueOnce({ status: 'passed' });
    const result = await runManager({
      request: 'fix the app',
      files: { 'src/App.jsx': 'old' },
      model: 'test-model',
      validate,
    });
    expect(result.summary).toBe('Fixed build');
    expect(result.files['src/App.jsx']).toBe(
      'export default function App() { return <main>good</main>; }',
    );
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('retries an empty repair response after validation failure', async () => {
    const modelClient = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          changes: [
            {
              path: 'src/App.jsx',
              content: 'export default function App() { return <main>bad</main>; }',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(JSON.stringify({ kind: 'answer', summary: 'I fixed it.' }))
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          summary: 'Fixed after retry',
          changes: [
            {
              path: 'src/App.jsx',
              content: 'export default function App() { return <main>good</main>; }',
            },
          ],
        }),
      );
    const validate = vi
      .fn()
      .mockResolvedValueOnce({ status: 'failed', diagnostics: 'syntax error' })
      .mockResolvedValueOnce({ status: 'passed' });

    const result = await runManager({
      request: 'fix the app',
      files: { 'src/App.jsx': 'old' },
      model: 'test-model',
      modelClient,
      validate,
    });

    expect(result.files['src/App.jsx']).toBe(
      'export default function App() { return <main>good</main>; }',
    );
    expect(result.summary).toBe('Fixed after retry');
    expect(modelClient).toHaveBeenCalledTimes(3);
    expect(modelClient.mock.calls[2][0].messages[0].content).toContain(
      'repairing one failed source file',
    );
  });

  it('retries an empty repair response after deterministic change rejection', async () => {
    const modelClient = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          changes: [{ path: '../unsafe.js', content: 'bad' }],
        }),
      )
      .mockResolvedValueOnce(JSON.stringify({ kind: 'changes', changes: [] }))
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          summary: 'Repaired unsafe path',
          changes: [
            {
              path: 'src/App.jsx',
              content: 'export default function App() { return <main>good</main>; }',
            },
          ],
        }),
      );

    const result = await runManager({
      request: 'fix the app',
      files: { 'src/App.jsx': 'old' },
      model: 'test-model',
      modelClient,
    });

    expect(result.files['src/App.jsx']).toBe(
      'export default function App() { return <main>good</main>; }',
    );
    expect(result.summary).toBe('Repaired unsafe path');
    expect(modelClient).toHaveBeenCalledTimes(3);
  });

  it('reports missing checks without invoking the model', async () => {
    const { askWebLLM } = (await import('../WebLLMAPI')) as unknown as {
      askWebLLM: ReturnType<typeof vi.fn>;
    };
    const result = await runManager({ request: 'run the tests', files: {}, model: 'test-model' });
    expect(result.summary).toContain('No eligible project checks');
    expect(askWebLLM).not.toHaveBeenCalled();
  });

  it('uses prior context, selected lines, and the default edit summary', async () => {
    const { askWebLLM } = (await import('../WebLLMAPI')) as unknown as {
      askWebLLM: ReturnType<typeof vi.fn>;
    };
    askWebLLM.mockResolvedValue(
      JSON.stringify({
        kind: 'changes',
        changes: [
          {
            path: 'src/App.jsx',
            content: 'export default function App() { return <main>new</main>; }',
          },
        ],
      }),
    );
    const result = await runManager({
      request: 'update the active component',
      files: { 'src/App.jsx': 'old' },
      activeFile: 'src/App.jsx',
      selectedLines: [1],
      priorContext: 'Earlier conversation context',
      model: 'test-model',
    });
    expect(result.summary).toBe('Prepared 1 file(s) for review.');
    expect(askWebLLM.mock.calls[0][3].messages[1].content).toContain(
      'Earlier conversation context',
    );
  });

  it('stops before execution when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runManager({
        request: 'explain the app',
        files: {},
        model: 'test-model',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'ManagerRunError', code: 'cancelled' });
  });

  it('does not accept an exhausted validation failure', async () => {
    const { askWebLLM } = (await import('../WebLLMAPI')) as unknown as {
      askWebLLM: ReturnType<typeof vi.fn>;
    };
    askWebLLM
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          changes: [
            {
              path: 'src/App.jsx',
              content: 'export default function App() { return <main>bad</main>; }',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          changes: [
            {
              path: 'src/App.jsx',
              content: 'export default function App() { return <main>still bad</main>; }',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          changes: [
            {
              path: 'src/App.jsx',
              content: 'export default function App() { return <main>nope</main>; }',
            },
          ],
        }),
      );
    const validate = vi.fn().mockResolvedValue({ status: 'failed', diagnostics: 'still broken' });
    await expect(
      runManager({
        request: 'fix the app',
        files: { 'src/App.jsx': 'old' },
        model: 'test-model',
        validate,
      }),
    ).rejects.toThrow(/still broken|Validation failed after 2 repair attempts/);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('runs the main-branch action protocol through write, validate, and finish', async () => {
    const modelClient = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          action: 'write_file',
          path: 'src/App.jsx',
          content: 'export default function App() { return <h1>New</h1>; }',
        }),
      )
      .mockResolvedValueOnce(JSON.stringify({ action: 'validate' }))
      .mockResolvedValueOnce(JSON.stringify({ action: 'finish', summary: 'Updated the title.' }));
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });
    const events: Array<{ action?: unknown; provenance?: string }> = [];

    const result = await runManager({
      request: 'change the title',
      files: { 'src/App.jsx': 'export default function App() { return <h1>Old</h1>; }' },
      activeFile: 'src/App.jsx',
      model: 'test-model',
      modelClient,
      validate,
      onEvent: (event) => events.push(event),
    });

    expect(result.files['src/App.jsx']).toContain('New');
    expect(validate).toHaveBeenCalledOnce();
    expect(modelClient).toHaveBeenCalledTimes(3);
    expect(
      events.some(
        (event) =>
          event.action === 'write_file' ||
          (event.action &&
            typeof event.action === 'object' &&
            'action' in event.action &&
            event.action.action === 'write_file'),
      ),
    ).toBe(true);
    expect(
      result.trace.events.some(
        (event) =>
          event.action === 'validate' ||
          (event.action &&
            typeof event.action === 'object' &&
            'action' in event.action &&
            event.action.action === 'validate'),
      ),
    ).toBe(true);
  });

  it('uses generic direct recovery when the action model repeats unchanged reads', async () => {
    const modelClient = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ action: 'read_file', path: 'src/App.jsx' }))
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

    const result = await runManager({
      request: 'create a dashboard',
      files: {
        'package.json': '{"dependencies":{"react":"latest"}}',
        'src/App.jsx':
          'export default function App() { return <div><h1>New Project</h1><p>Start coding here...</p></div>; }',
        'src/main.jsx': "import App from './App.jsx';",
      },
      model: 'test-model',
      modelClient,
      validate: vi.fn().mockResolvedValue({ status: 'passed', check: 'build' }),
    });

    expect(result.files['src/App.jsx']).toContain('Dashboard');
    expect(result.summary).toContain('Created the dashboard.');
    expect(result.trace.events.some((event) => event.provenance === 'recovery')).toBe(true);
  });

  it('supports action-protocol deletion with validation before finishing', async () => {
    const modelClient = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ action: 'delete_file', path: 'src/old.js' }))
      .mockResolvedValueOnce(JSON.stringify({ action: 'validate' }))
      .mockResolvedValueOnce(
        JSON.stringify({ action: 'finish', summary: 'Removed the old file.' }),
      );
    const validate = vi.fn().mockResolvedValue({ status: 'passed' });

    const result = await runManager({
      request: 'delete src/old.js',
      files: { 'src/old.js': 'export const old = true;' },
      model: 'test-model',
      modelClient,
      validate,
    });

    expect(result.files['src/old.js']).toBeUndefined();
    expect(result.changes).toEqual([
      { path: 'src/old.js', before: 'export const old = true;', after: undefined },
    ]);
  });

  it('forwards staged file changes on the finished event for welcome fence writes', async () => {
    const clockSource = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [time, setTime] = useState('00:00');
  const [isRunning, setIsRunning] = useState(false);
  const startClock = () => {
    setIsRunning(true);
    setTime('12:00');
  };
  return (
    <div className="app">
      <h1>Round Clock</h1>
      <p>{time}</p>
      <button className="primaryAction" type="button" onClick={startClock} disabled={isRunning}>
        Start
      </button>
    </div>
  );
}`;
    const modelClient = vi.fn().mockResolvedValueOnce(`\`\`\`jsx\n${clockSource}\n\`\`\``);
    const events: Array<{ type?: string; changes?: Array<{ path?: string }> }> = [];
    const result = await runManager({
      request: 'create a analog round clock app',
      files: {
        'src/App.jsx':
          'export default function App() {\n  return (\n    <div>\n      <h1>New Project</h1>\n      <p>Start coding here...</p>\n    </div>\n  );\n}',
        'src/main.jsx': 'import App from "./App";',
        'package.json': '{"name":"new-project"}',
      },
      model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
      modelClient,
      validate: vi.fn().mockResolvedValue({ status: 'unavailable', check: 'build' }),
      inspectPreview: vi.fn().mockResolvedValue({
        status: 'passed',
        elements: ['h1: Round Clock', 'button: Start'],
        screenshotCaptured: true,
      }),
      onEvent: (event) => events.push(event),
    });

    expect(result.files['src/App.jsx']).toContain('Round Clock');
    expect(result.files['src/App.jsx']).not.toContain('New Project');
    expect(result.changes.some((change) => change.path === 'src/App.jsx')).toBe(true);
    const finished = events.find((event) => event.type === 'finished');
    expect(finished?.changes?.some((change) => change.path === 'src/App.jsx')).toBe(true);
  });
});
