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
    ({ askWebLLM } = await import('../WebLLMAPI'));
  });

  it('runs planner → coder → reviewer and returns shared changes', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"read_file","path":"src/a.js"}')
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"goals\\":[\\"bump\\"],\\"files\\":[\\"src/a.js\\"],\\"steps\\":[\\"edit\\"]}"}',
      )
      .mockResolvedValueOnce('{"action":"write_file","path":"src/a.js","content":"const a = 2;"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"Updated a"}')
      .mockResolvedValueOnce('{"action":"validate"}')
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
});
