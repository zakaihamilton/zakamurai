import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runAgent } from './Runner';

vi.mock('../WebLLMAPI', () => ({ askWebLLM: vi.fn() }));

describe('runAgent', () => {
  let askWebLLM;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ askWebLLM } = await import('../WebLLMAPI'));
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
    expect(askWebLLM.mock.calls[0][3].messages[1].content).toContain('Scope: current file');
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

    const initialPrompt = askWebLLM.mock.calls[0][3].messages[1].content;
    expect(initialPrompt).toContain('Scope: whole project');
    expect(initialPrompt).not.toContain('Active file:');
    expect(initialPrompt).not.toContain('Selected lines:');
    expect(result.changes).toHaveLength(2);
  });
});
