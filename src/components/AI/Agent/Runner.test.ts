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

  it('stops after repeated actions and max turn limits', async () => {
    askWebLLM
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce('{"action":"list_files"}')
      .mockResolvedValueOnce('{"action":"list_files"}');

    await expect(
      runAgent({
        request: 'loop',
        files: { 'src/a.js': 'a' },
        model: 'test',
        maxTurns: 5,
      }),
    ).rejects.toThrow(/repeating the same action/);

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
    expect(events.some((event) => event.error)).toBe(true);
    expect(validate).toHaveBeenCalled();
  });

  it('throws after repeated protocol failures', async () => {
    askWebLLM.mockResolvedValueOnce('bad').mockResolvedValueOnce('still bad');
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
