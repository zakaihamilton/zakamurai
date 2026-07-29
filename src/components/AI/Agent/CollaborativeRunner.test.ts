import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runCollaborativeAgent } from './CollaborativeRunner';
import {
  createDefaultRoleGraph,
  createRoleNode,
  parsePlanSummary,
  parseReviewSummary,
} from './Roles';

vi.mock('../WebLLMAPI', () => ({ askWebLLM: vi.fn() }));

describe('Roles parsers', () => {
  it('parses plan and review summaries', () => {
    expect(parsePlanSummary('{"goals":["g"],"files":["a.js"],"steps":["s1"]}')).toEqual({
      goals: ['g'],
      files: ['a.js'],
      steps: ['s1'],
      raw: '{"goals":["g"],"files":["a.js"],"steps":["s1"]}',
    });
    expect(parseReviewSummary('{"approved":false,"fixes":["fix null"],"notes":"n"}')).toEqual({
      approved: false,
      fixes: ['fix null'],
      notes: 'n',
      raw: '{"approved":false,"fixes":["fix null"],"notes":"n"}',
    });
    expect(parseReviewSummary('Looks good')).toMatchObject({ approved: true });
  });
});

describe('runCollaborativeAgent', () => {
  let askWebLLM;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    ({ askWebLLM } = await import('../WebLLMAPI'));
  });

  it('runs planner → coder → reviewer and returns shared changes', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"read_file","path":"src/a.js"}')
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"goals\\":[\\"bump\\"],\\"files\\":[\\"src/a.js\\"],\\"steps\\":[\\"edit\\"]}"}',
      )
      .mockResolvedValueOnce('{"action":"write_file","path":"src/a.js","content":"const a = 2;"}')
      .mockResolvedValueOnce('{"action":"validate"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Updated a"}')
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"approved\\":true,\\"notes\\":\\"ok\\"}"}',
      );

    const validate = vi.fn().mockResolvedValue('Checks passed.');
    const events = [];
    const result = await runCollaborativeAgent({
      request: 'update a',
      activeFile: 'src/a.js',
      files: { 'src/a.js': 'const a = 1;' },
      validate,
      model: 'test',
      onEvent: (event) => events.push(event),
    });

    expect(result.changes[0].after).toBe('const a = 2;');
    expect(result.review.approved).toBe(true);
    expect(result.plan.files).toContain('src/a.js');
    expect(events.some((event) => event.agentRole === 'planner')).toBe(true);
    expect(events.some((event) => event.agentRole === 'coder')).toBe(true);
    expect(events.some((event) => event.agentRole === 'reviewer')).toBe(true);
    expect(validate).toHaveBeenCalled();
  });

  it('retries coder once when reviewer rejects', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"goals\\":[\\"g\\"],\\"files\\":[\\"src/a.js\\"],\\"steps\\":[\\"s\\"]}"}',
      )
      .mockResolvedValueOnce('{"action":"write_file","path":"src/a.js","content":"bad"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"first"}')
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"approved\\":false,\\"fixes\\":[\\"use 2\\"],\\"notes\\":\\"no\\"}"}',
      )
      .mockResolvedValueOnce('{"action":"write_file","path":"src/a.js","content":"const a = 2;"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"fixed"}')
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"approved\\":true,\\"notes\\":\\"good\\"}"}',
      );

    const result = await runCollaborativeAgent({
      request: 'update a',
      files: { 'src/a.js': 'const a = 1;' },
      model: 'test',
    });

    expect(result.changes[0].after).toBe('const a = 2;');
    expect(result.review.approved).toBe(true);
    expect(askWebLLM).toHaveBeenCalledTimes(7);
  });

  it('uses per-role models and custom role graphs', async () => {
    const planner = createRoleNode({ id: 'p1', kind: 'planner', modelId: 'model-plan' });
    const coder = createRoleNode({ id: 'c1', kind: 'coder', modelId: 'model-code' });
    const graph = {
      entryRoleId: 'p1',
      roles: [planner, coder],
      edges: [{ from: 'p1', to: 'c1', when: 'always' }],
    };

    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"goals\\":[\\"g\\"],\\"files\\":[\\"src/a.js\\"],\\"steps\\":[\\"s\\"]}"}',
      )
      .mockResolvedValueOnce('{"action":"write_file","path":"src/a.js","content":"done"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"coded"}');

    const result = await runCollaborativeAgent({
      request: 'update a',
      files: { 'src/a.js': 'old' },
      model: 'fallback-model',
      roleGraph: graph,
    });

    expect(result.changes[0].after).toBe('done');
    expect(askWebLLM.mock.calls[0][3].model).toBe('model-plan');
    expect(askWebLLM.mock.calls[1][3].model).toBe('model-code');
    expect(askWebLLM.mock.calls[2][3].model).toBe('model-code');
  });

  it('falls back to the session model when a role has no modelId', async () => {
    const graph = createDefaultRoleGraph();
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"goals\\":[],\\"files\\":[],\\"steps\\":[]}"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"noop"}')
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"approved\\":true,\\"notes\\":\\"ok\\"}"}',
      );

    await runCollaborativeAgent({
      request: 'noop',
      files: { 'src/a.js': 'a' },
      model: 'session-model',
      roleGraph: graph,
    });

    expect(askWebLLM.mock.calls.every((call) => call[3].model === 'session-model')).toBe(true);
  });

  it('passes inherited conversation context into the first team role', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"goals\\":[],\\"files\\":[],\\"steps\\":[]}"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"noop"}')
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"approved\\":true,\\"notes\\":\\"ok\\"}"}',
      );

    await runCollaborativeAgent({
      request: 'continue',
      files: { 'src/a.js': 'a' },
      model: 'test',
      priorContext: 'User: We already chose accessible controls.',
    });

    expect(askWebLLM.mock.calls[0][3].messages[1].content).toContain(
      'We already chose accessible controls.',
    );
  });

  it('stops after reject retries are exhausted without a further always edge', async () => {
    const planner = createRoleNode({ id: 'p1', kind: 'planner' });
    const coder = createRoleNode({ id: 'c1', kind: 'coder' });
    const reviewer = createRoleNode({ id: 'r1', kind: 'reviewer' });
    const graph = {
      entryRoleId: 'p1',
      roles: [planner, coder, reviewer],
      edges: [
        { from: 'p1', to: 'c1', when: 'always' },
        { from: 'c1', to: 'r1', when: 'always' },
        { from: 'r1', to: 'c1', when: 'reject', maxTimes: 1 },
      ],
    };

    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"goals\\":[\\"g\\"],\\"files\\":[\\"src/a.js\\"],\\"steps\\":[\\"s\\"]}"}',
      )
      .mockResolvedValueOnce('{"action":"write_file","path":"src/a.js","content":"v1"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"first"}')
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"approved\\":false,\\"fixes\\":[\\"again\\"],\\"notes\\":\\"no\\"}"}',
      )
      .mockResolvedValueOnce('{"action":"write_file","path":"src/a.js","content":"v2"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"second"}')
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"approved\\":false,\\"fixes\\":[\\"still\\"],\\"notes\\":\\"no\\"}"}',
      );

    const result = await runCollaborativeAgent({
      request: 'update a',
      files: { 'src/a.js': 'old' },
      model: 'test',
      roleGraph: graph,
    });

    expect(result.changes[0].after).toBe('v2');
    expect(result.review.approved).toBe(false);
    expect(result.summary).toContain('unresolved notes');
  });

  it('runs custom roles without looping approve edges', async () => {
    const custom = createRoleNode({
      id: 'sec',
      kind: 'custom',
      label: 'Security',
      systemPrompt: 'Check security.',
    });
    const reviewer = createRoleNode({ id: 'rev', kind: 'reviewer', label: 'Review' });
    const graph = {
      entryRoleId: 'sec',
      roles: [custom, reviewer],
      edges: [{ from: 'sec', to: 'rev', when: 'always' }],
    };

    askWebLLM
      .mockResolvedValueOnce('{"action":"finish","summary":"secured"}')
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"approved\\":true,\\"notes\\":\\"ship it\\"}"}',
      );

    const result = await runCollaborativeAgent({
      request: 'harden',
      files: { 'src/a.js': 'a' },
      model: 'test',
      roleGraph: graph,
    });

    expect(result.roleSummaries.sec).toBe('secured');
    expect(result.review.approved).toBe(true);
    expect(askWebLLM).toHaveBeenCalledTimes(2);
  });

  it('aborts when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runCollaborativeAgent({
        request: 'x',
        files: { 'a.js': 'a' },
        model: 'test',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects invalid role graphs before running', async () => {
    const planner = createRoleNode({ id: 'p1', kind: 'planner' });
    const coder = createRoleNode({ id: 'c1', kind: 'coder' });
    const reviewer = createRoleNode({ id: 'r1', kind: 'reviewer' });
    await expect(
      runCollaborativeAgent({
        request: 'x',
        files: { 'a.js': 'a' },
        model: 'test',
        roleGraph: {
          entryRoleId: 'p1',
          roles: [planner, coder, reviewer],
          edges: [{ from: 'c1', to: 'r1', when: 'always' }],
        },
      }),
    ).rejects.toThrow(/Invalid workflow graph/);
  });

  it('approves review notes when reviewer approves without fixes', async () => {
    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"goals\\":[],\\"files\\":[],\\"steps\\":[]}"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"done"}')
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"approved\\":true,\\"notes\\":\\"ship it\\"}"}',
      );

    const result = await runCollaborativeAgent({
      request: 'ship',
      files: { 'src/a.js': 'a' },
      model: 'test',
    });

    expect(result.summary).toContain('Review approved.');
    expect(result.summary).toContain('ship it');
  });

  it('falls back to reviewer notes when fixes are absent on reject', async () => {
    const planner = createRoleNode({ id: 'p1', kind: 'planner' });
    const coder = createRoleNode({ id: 'c1', kind: 'coder' });
    const reviewer = createRoleNode({ id: 'r1', kind: 'reviewer' });
    const graph = {
      entryRoleId: 'p1',
      roles: [planner, coder, reviewer],
      edges: [
        { from: 'p1', to: 'c1', when: 'always' },
        { from: 'c1', to: 'r1', when: 'always' },
      ],
    };

    askWebLLM
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"goals\\":[\\"g\\"],\\"files\\":[\\"src/a.js\\"],\\"steps\\":[\\"s\\"]}"}',
      )
      .mockResolvedValueOnce('{"action":"finish","summary":"coded without writes"}')
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"approved\\":false,\\"notes\\":\\"needs work\\"}"}',
      );

    const result = await runCollaborativeAgent({
      request: 'update a',
      files: { 'src/a.js': 'old' },
      model: 'test',
      roleGraph: graph,
    });

    expect(result.review.approved).toBe(false);
    expect(result.summary).toContain('unresolved notes');
    expect(result.summary).toContain('needs work');
  });
});
