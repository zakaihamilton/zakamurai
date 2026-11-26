import { describe, expect, it, vi } from 'vitest';
import { getModelCapabilityProfile } from '../ReliabilityContracts';
import type { ManagerPlan } from '../types';
import { runManagerDirectModelPath } from './ManagerDirectModel';
import { createManagerToolContext } from './ManagerTools';

function makePlan(overrides: Partial<ManagerPlan> = {}): ManagerPlan {
  return {
    intent: 'edit',
    confidence: 'high',
    modelRequired: true,
    steps: [],
    ...overrides,
  };
}

describe('runManagerDirectModelPath', () => {
  const model = 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC';
  const modelProfile = getModelCapabilityProfile(model);

  it('answers directly and handles groundedness validation', async () => {
    const tools = createManagerToolContext(
      { 'src/App.jsx': 'export default function App() {}' },
      null,
      {},
    );
    const events: unknown[] = [];
    const result = await runManagerDirectModelPath({
      request: 'Explain App.jsx',
      model,
      plan: makePlan({ intent: 'explanation' }),
      modelProfile,
      toolResults: [
        {
          tool: 'read_file',
          value: { path: 'src/App.jsx', content: 'export default function App() {}' },
          text: 'src/App.jsx: export default function App() {}',
        },
      ],
      tools,
      workspace: tools.workspace,
      onEvent: (event) => events.push(event),
      modelClient: vi
        .fn()
        .mockResolvedValueOnce('not json')
        .mockResolvedValueOnce(
          JSON.stringify({
            kind: 'request-context',
            requests: [{ tool: 'list_files', input: {} }],
          }),
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            kind: 'answer',
            summary: 'App exports a default App component.',
          }),
        ),
      notifyTool: vi.fn().mockResolvedValue({
        tool: 'list_files',
        value: ['src/App.jsx'],
        text: 'src/App.jsx',
      }),
    });

    expect(result.summary).toBe('App exports a default App component.');
    expect(result.changes).toEqual([]);
    expect(events.length).toBeGreaterThan(0);
  });

  it('throws on aborted signal or empty request-context', async () => {
    const tools = createManagerToolContext(
      { 'src/App.jsx': 'export default function App() {}' },
      null,
      {},
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      runManagerDirectModelPath({
        request: 'Explain App.jsx',
        model,
        plan: makePlan({ intent: 'explanation' }),
        modelProfile,
        toolResults: [],
        tools,
        workspace: tools.workspace,
        signal: controller.signal,
        onEvent: vi.fn(),
        modelClient: vi.fn(),
        notifyTool: vi.fn(),
      }),
    ).rejects.toThrow('Manager stopped');

    await expect(
      runManagerDirectModelPath({
        request: 'Explain App.jsx',
        model,
        plan: makePlan({ intent: 'explanation' }),
        modelProfile,
        toolResults: [],
        tools,
        workspace: tools.workspace,
        onEvent: vi.fn(),
        modelClient: vi
          .fn()
          .mockResolvedValue(JSON.stringify({ kind: 'request-context', requests: [] })),
        notifyTool: vi.fn(),
      }),
    ).rejects.toThrow('The model requested no usable context.');
  });

  it('repairs failed validation and runs preview inspection', async () => {
    const validate = vi
      .fn()
      .mockResolvedValueOnce({ status: 'failed', diagnostics: 'Syntax error on line 1' })
      .mockResolvedValueOnce({ status: 'passed', diagnostics: '' });
    const inspectPreview = vi.fn().mockResolvedValue({
      status: 'passed',
      path: '/preview/dist/index.html',
      title: 'App',
      text: 'Hello',
    });
    const tools = createManagerToolContext(
      { 'src/App.jsx': 'export default function App() { return <div>Old</div>; }' },
      null,
      { validate, inspectPreview },
    );

    const modelClient = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ kind: 'answer', summary: 'no edits' }))
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          summary: 'Broken draft',
          changes: [
            {
              path: 'src/App.jsx',
              content: 'export default function App() { return <div>Broken</div>; }',
            },
          ],
        }),
      )
      .mockResolvedValueOnce('invalid repair json')
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'changes',
          summary: 'Fixed App',
          changes: [
            {
              path: 'src/App.jsx',
              content: 'export default function App() { return <div>Fixed</div>; }',
            },
          ],
        }),
      );

    const result = await runManagerDirectModelPath({
      request: 'Update App',
      model,
      plan: makePlan({
        steps: [{ kind: 'tool', tool: 'inspect_preview', reason: 'check preview' }],
      }),
      modelProfile,
      toolResults: [],
      tools,
      workspace: tools.workspace,
      seed: 42,
      onEvent: vi.fn(),
      modelClient,
      inspectPreview,
      notifyTool: vi.fn().mockResolvedValue({
        tool: 'inspect_preview',
        value: { status: 'passed', text: 'Hello' },
        text: 'Preview passed',
      }),
    });

    expect(result.summary).toContain('Fixed App');
    expect(result.summary).toContain('Preview inspection:');
    expect(result.changes).toHaveLength(1);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('repairs deterministically rejected changes and throws when exhausted', async () => {
    const tools = createManagerToolContext(
      { 'src/App.jsx': 'export default function App() {}' },
      null,
      {},
    );
    const badChange = JSON.stringify({
      kind: 'changes',
      summary: 'Unsafe path',
      changes: [{ path: '../outside.js', content: 'export const x = 1;' }],
    });
    const goodChange = JSON.stringify({
      kind: 'changes',
      summary: 'Deleted unused and updated App',
      changes: [{ path: 'src/App.jsx', content: 'export default function App() { return null; }' }],
    });

    const repaired = await runManagerDirectModelPath({
      request: 'Fix App',
      model,
      plan: makePlan(),
      modelProfile,
      toolResults: [],
      tools,
      workspace: tools.workspace,
      onEvent: vi.fn(),
      modelClient: vi
        .fn()
        .mockResolvedValueOnce(badChange)
        .mockResolvedValueOnce('bad json')
        .mockResolvedValueOnce(goodChange),
      notifyTool: vi.fn(),
    });
    expect(repaired.summary).toBe('Deleted unused and updated App');

    await expect(
      runManagerDirectModelPath({
        request: 'Fix App',
        model,
        plan: makePlan(),
        modelProfile,
        toolResults: [],
        tools: createManagerToolContext(
          { 'src/App.jsx': 'export default function App() {}' },
          null,
          {},
        ),
        workspace: createManagerToolContext(
          { 'src/App.jsx': 'export default function App() {}' },
          null,
          {},
        ).workspace,
        onEvent: vi.fn(),
        modelClient: vi.fn().mockResolvedValue(badChange),
        notifyTool: vi.fn(),
      }),
    ).rejects.toThrow();
  });

  it('fails when edit requests never return changes or validation stays failed', async () => {
    const tools = createManagerToolContext(
      { 'src/App.jsx': 'export default function App() {}' },
      null,
      {},
    );
    await expect(
      runManagerDirectModelPath({
        request: 'Edit App',
        model,
        plan: makePlan(),
        modelProfile,
        toolResults: [],
        tools,
        workspace: tools.workspace,
        onEvent: vi.fn(),
        modelClient: vi.fn().mockResolvedValue(JSON.stringify({ kind: 'answer', summary: 'nope' })),
        notifyTool: vi.fn(),
      }),
    ).rejects.toThrow('The model did not return changes for an edit request.');

    const alwaysFailTools = createManagerToolContext(
      { 'src/App.jsx': 'export default function App() {}' },
      null,
      { validate: vi.fn().mockResolvedValue({ status: 'failed', diagnostics: 'Still broken' }) },
    );
    await expect(
      runManagerDirectModelPath({
        request: 'Edit App',
        model,
        plan: makePlan(),
        modelProfile,
        toolResults: [],
        tools: alwaysFailTools,
        workspace: alwaysFailTools.workspace,
        onEvent: vi.fn(),
        modelClient: vi.fn().mockResolvedValue(
          JSON.stringify({
            kind: 'changes',
            summary: 'Attempt',
            changes: [
              {
                path: 'src/App.jsx',
                content: 'export default function App() { return <main>Ok</main>; }',
              },
            ],
          }),
        ),
        notifyTool: vi.fn(),
      }),
    ).rejects.toThrow('Still broken');
  });
});
