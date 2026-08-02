import { describe, expect, it } from 'vitest';
import { buildManagerModelPrompt, parseModelResult } from './ManagerProtocol';

describe('manager model protocol', () => {
  it('parses answers and embedded or fenced JSON', () => {
    expect(parseModelResult('{"kind":"answer","summary":"done"}')).toEqual({
      kind: 'answer',
      summary: 'done',
    });
    expect(parseModelResult('```json\n{"kind":"answer","summary":"fenced"}\n```')).toMatchObject({
      summary: 'fenced',
    });
    expect(
      parseModelResult('Here is the result: {"kind":"answer","summary":"embedded"}'),
    ).toMatchObject({ summary: 'embedded' });
  });

  it('bounds and filters context requests', () => {
    const result = parseModelResult(
      JSON.stringify({
        kind: 'request-context',
        requests: [
          { tool: 'read_file', input: { path: 'src/App.jsx' } },
          { tool: 'search_workspace', input: { query: 'answer' } },
          { tool: 'unknown', input: {} },
          { tool: 'read_file', input: {} },
        ],
      }),
    );
    expect(result).toMatchObject({
      kind: 'request-context',
      requests: [{ tool: 'read_file' }, { tool: 'search_workspace' }],
    });
  });

  it('normalizes complete file contents and rejects malformed results', () => {
    expect(
      parseModelResult(
        JSON.stringify({
          kind: 'changes',
          changes: [
            { path: 'a.js', content: 'new' },
            { path: '', content: 'bad' },
          ],
        }),
      ),
    ).toMatchObject({
      kind: 'changes',
      changes: [{ path: 'a.js', content: 'new' }],
    });
    expect(() => parseModelResult('not json')).toThrow(/JSON/);
    expect(() => parseModelResult('{"kind":"tool"}')).toThrow(/Unknown/);
  });

  it('handles escaped embedded JSON and defensive protocol shapes', () => {
    const escaped = JSON.stringify({ kind: 'answer', summary: 'A "quoted" answer' });
    expect(parseModelResult(`prefix ${escaped} suffix`)).toMatchObject({
      kind: 'answer',
      summary: 'A "quoted" answer',
    });
    expect(parseModelResult(JSON.stringify({ kind: 'answer' }))).toEqual({
      kind: 'answer',
      summary: '',
    });
    expect(parseModelResult(JSON.stringify({ kind: 'request-context', requests: {} }))).toEqual({
      kind: 'request-context',
      requests: [],
    });
    expect(
      parseModelResult(
        JSON.stringify({
          kind: 'request-context',
          requests: [
            { tool: 'read_file', input: {} },
            { tool: 'search_workspace', input: {} },
            { tool: 'search_semantic', input: {} },
            { tool: 'list_files' },
          ],
        }),
      ),
    ).toEqual({ kind: 'request-context', requests: [{ tool: 'list_files' }] });
    expect(
      parseModelResult(
        JSON.stringify({
          kind: 'changes',
          changes: [{ path: 'a.js', before: 'old', after: 'new', content: 'new' }],
        }),
      ),
    ).toMatchObject({ changes: [{ path: 'a.js', before: 'old', after: 'new', content: 'new' }] });
    expect(parseModelResult(JSON.stringify({ kind: 'changes', changes: {} }))).toMatchObject({
      kind: 'changes',
      changes: [],
    });
    expect(
      parseModelResult(
        JSON.stringify({
          kind: 'changes',
          changes: [
            { path: 42, after: 'ignored' },
            { path: 'a.js', after: 'replacement' },
          ],
        }),
      ),
    ).toMatchObject({ changes: [{ path: 'a.js', after: 'replacement' }] });
    expect(() => parseModelResult('{}')).toThrow(/missing/);
  });

  it('builds answer, change, and repair prompts with bounded evidence', () => {
    expect(buildManagerModelPrompt('explain', '', 'answer')).toContain('Workspace evidence: none');
    expect(buildManagerModelPrompt('edit', 'evidence', 'generate-changes')).toContain(
      'complete replacement',
    );
    expect(
      buildManagerModelPrompt('repair', 'evidence', 'repair-changes', 'syntax error'),
    ).toContain('syntax error');
  });
});
