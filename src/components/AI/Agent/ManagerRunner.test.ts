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
          changes: [{ path: 'src/App.jsx', content: 'new' }],
        }),
      );
    const result = await runManager({
      request: 'change the app',
      files: { 'src/App.jsx': 'old' },
      activeFile: 'src/App.jsx',
      model: 'test-model',
    });
    expect(result.summary).toBe('Repaired');
    expect(result.changes[0]).toMatchObject({ path: 'src/App.jsx', after: 'new' });
    expect(askWebLLM).toHaveBeenCalledTimes(2);
  });

  it('repairs changes after a deterministic validation failure', async () => {
    const { askWebLLM } = (await import('../WebLLMAPI')) as unknown as {
      askWebLLM: ReturnType<typeof vi.fn>;
    };
    askWebLLM
      .mockResolvedValueOnce(
        JSON.stringify({ kind: 'changes', changes: [{ path: 'src/App.jsx', content: 'bad' }] }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          summary: 'Fixed build',
          changes: [{ path: 'src/App.jsx', content: 'good' }],
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
    expect(result.files['src/App.jsx']).toBe('good');
    expect(validate).toHaveBeenCalledTimes(2);
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
      JSON.stringify({ kind: 'changes', changes: [{ path: 'src/App.jsx', content: 'new' }] }),
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
        JSON.stringify({ kind: 'changes', changes: [{ path: 'src/App.jsx', content: 'bad' }] }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          changes: [{ path: 'src/App.jsx', content: 'still bad' }],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({ kind: 'changes', changes: [{ path: 'src/App.jsx', content: 'nope' }] }),
      );
    const validate = vi.fn().mockResolvedValue({ status: 'failed', diagnostics: 'still broken' });
    await expect(
      runManager({
        request: 'fix the app',
        files: { 'src/App.jsx': 'old' },
        model: 'test-model',
        validate,
      }),
    ).rejects.toThrow('still broken');
    expect(validate).toHaveBeenCalledTimes(3);
  });
});
