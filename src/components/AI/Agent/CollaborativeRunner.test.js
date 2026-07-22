import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runCollaborativeAgent } from './CollaborativeRunner';
import { parsePlanSummary, parseReviewSummary } from './Roles';

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
      // planner
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"goals\\":[\\"g\\"],\\"files\\":[\\"src/a.js\\"],\\"steps\\":[\\"s\\"]}"}',
      )
      // coder first pass
      .mockResolvedValueOnce('{"action":"write_file","path":"src/a.js","content":"bad"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"first"}')
      // reviewer reject
      .mockResolvedValueOnce(
        '{"action":"finish","summary":"{\\"approved\\":false,\\"fixes\\":[\\"use 2\\"],\\"notes\\":\\"no\\"}"}',
      )
      // coder retry
      .mockResolvedValueOnce('{"action":"write_file","path":"src/a.js","content":"const a = 2;"}')
      .mockResolvedValueOnce('{"action":"finish","summary":"fixed"}')
      // reviewer approve
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
});
