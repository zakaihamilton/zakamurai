import { describe, expect, it } from 'vitest';
import { normalizeAgentPath, parseAgentAction } from './Protocol';

describe('agent protocol', () => {
  it('parses a JSON action from a fenced response', () => {
    expect(parseAgentAction('```json\n{"action":"read_file","path":"src/App.js"}\n```')).toEqual({
      action: 'read_file',
      path: 'src/App.js',
    });
  });

  it('rejects paths outside the workspace', () => {
    expect(() => normalizeAgentPath('../secret')).toThrow(/workspace/);
  });

  it('requires complete content for writes', () => {
    expect(() => parseAgentAction('{"action":"write_file","path":"a.js"}')).toThrow(/content/);
  });

  it('parses search_semantic and requires a query', () => {
    expect(parseAgentAction('{"action":"search_semantic","query":"auth flow","k":3}')).toEqual({
      action: 'search_semantic',
      query: 'auth flow',
      k: 3,
    });
    expect(() => parseAgentAction('{"action":"search_semantic"}')).toThrow(/query/);
  });
});
