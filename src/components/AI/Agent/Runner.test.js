import { beforeEach, describe, expect, it, vi } from 'vitest';
import { askWebLLM } from '../WebLLMAPI';
import { runAgent } from './Runner';

vi.mock('../WebLLMAPI', () => ({ askWebLLM: vi.fn() }));

describe('runAgent', () => {
  beforeEach(() => vi.clearAllMocks());

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
  });
});
