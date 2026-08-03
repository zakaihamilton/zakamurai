import { describe, expect, it, vi } from 'vitest';
import { AgentWorkspace } from './Workspace';

describe('AgentWorkspace', () => {
  it('isolates edits and reports its changes', () => {
    const source = { 'src/a.js': 'const a = 1;' };
    const workspace = new AgentWorkspace(source);
    workspace.write('src/a.js', 'const a = 2;');
    workspace.write('src/b.js', 'export {};');

    expect(source['src/a.js']).toBe('const a = 1;');
    expect(workspace.changes()).toEqual([
      { path: 'src/a.js', before: 'const a = 1;', after: 'const a = 2;' },
      { path: 'src/b.js', before: undefined, after: 'export {};' },
    ]);
  });

  it('searches across workspace text', () => {
    const workspace = new AgentWorkspace({
      'src/a.js': 'const needle = true;',
      'src/b.css': '.other {}',
    });
    expect(workspace.search('needle')).toContain('src/a.js:1');
    expect(workspace.search('needle', '.css')).toBe('No matches.');
  });

  it('stages deletions in changes()', () => {
    const workspace = new AgentWorkspace({ 'src/a.js': 'gone' });
    workspace.delete('src/a.js');
    expect(workspace.changes()).toEqual([{ path: 'src/a.js', before: 'gone', after: undefined }]);
  });

  it('formats semantic search results', async () => {
    const workspace = new AgentWorkspace({});
    const retrieve = vi
      .fn()
      .mockResolvedValue([
        { filePath: 'src/auth.js', content: 'function login() {}', score: 0.91 },
      ]);
    const result = await workspace.semanticSearch('authentication', retrieve, 3);
    expect(retrieve).toHaveBeenCalledWith('authentication', 3);
    expect(result).toContain('src/auth.js');
    expect(result).toContain('0.910');
  });

  it('filters file list by query', () => {
    const workspace = new AgentWorkspace({
      'src/a.js': 'a',
      'src/b.css': 'b',
      'lib/utils.js': 'c',
    });
    expect(workspace.list()).toEqual(['lib/utils.js', 'src/a.js', 'src/b.css']);
    expect(workspace.list('a')).toEqual(['src/a.js']);
    expect(workspace.list('.css')).toEqual(['src/b.css']);
  });

  it('supports glob-style file queries from local models', () => {
    const workspace = new AgentWorkspace({
      'src/App.jsx': 'app',
      'src/main.jsx': 'main',
      'src/App.module.css': 'styles',
    });

    expect(workspace.list('*.jsx')).toEqual(['src/App.jsx', 'src/main.jsx']);
    expect(workspace.list('src/*.module.css')).toEqual(['src/App.module.css']);
  });

  it('truncates read output beyond 20k characters', () => {
    const content = 'x'.repeat(25000);
    const workspace = new AgentWorkspace({ 'big.txt': content });
    const result = workspace.read('big.txt');
    expect(result).toContain('...[truncated]');
    expect(result.length).toBeLessThan(content.length);
    expect(result.startsWith('x'.repeat(20000))).toBe(true);
  });

  it('throws when reading or deleting a missing file', () => {
    const workspace = new AgentWorkspace({});
    expect(() => workspace.read('missing.js')).toThrow('File not found: missing.js');
    expect(() => workspace.delete('missing.js')).toThrow('File not found: missing.js');
  });

  it('throws when search query is empty', () => {
    const workspace = new AgentWorkspace({ 'a.js': 'code' });
    expect(() => workspace.search('')).toThrow('search_workspace requires a query');
  });

  it('searches with regex pattern syntax', () => {
    const workspace = new AgentWorkspace({
      'src/a.js': 'const foo = 1;\nconst bar = 2;',
    });
    const result = workspace.search('/foo|bar/');
    expect(result).toContain('src/a.js');
    expect(result).toContain('foo');
    expect(result).toContain('bar');
  });

  it('uses workspaceIndex when available', async () => {
    const queryText = vi.fn().mockResolvedValue([{ path: 'src/a.js', preview: 'needle here' }]);
    const workspace = new AgentWorkspace({ 'src/a.js': 'needle here' }, { queryText });
    const indexed = await workspace.search('needle');
    expect(queryText).toHaveBeenCalledWith('needle', 100);
    expect(indexed).toContain('src/a.js');
  });

  it('falls back when workspaceIndex throws or returns no matches', async () => {
    const workspace = new AgentWorkspace({ 'src/a.js': 'needle here' });

    workspace.workspaceIndex = {
      queryText: vi.fn().mockRejectedValue(new Error('index failed')),
    };
    const fallbackAfterError = await workspace.search('needle');
    expect(fallbackAfterError).toContain('src/a.js');

    workspace.workspaceIndex = {
      queryText: vi.fn().mockResolvedValue([]),
    };
    const fallbackAfterEmpty = await workspace.search('needle');
    expect(fallbackAfterEmpty).toContain('src/a.js');
  });

  it('filters workspaceIndex results by glob', async () => {
    const workspace = new AgentWorkspace(
      {},
      {
        queryText: vi.fn().mockResolvedValue([
          { path: 'src/a.js', preview: 'needle' },
          { path: 'src/b.css', preview: 'needle' },
        ]),
      },
    );
    const result = await workspace.search('needle', '*.css');
    expect(result).toContain('src/b.css');
    expect(result).not.toContain('src/a.js');
  });

  it('returns unavailable message when semantic retrieve fn is missing', async () => {
    const workspace = new AgentWorkspace({});
    expect(await workspace.semanticSearch('auth')).toBe(
      'Semantic search is unavailable in this session.',
    );
    expect(await workspace.semanticSearch('auth', null)).toBe(
      'Semantic search is unavailable in this session.',
    );
  });

  it('returns no matches message for empty semantic results', async () => {
    const workspace = new AgentWorkspace({});
    const retrieve = vi.fn().mockResolvedValue([]);
    expect(await workspace.semanticSearch('auth', retrieve)).toBe('No semantic matches.');
  });

  it('throws when semantic search query is empty', async () => {
    const workspace = new AgentWorkspace({});
    await expect(workspace.semanticSearch('', vi.fn())).rejects.toThrow(
      'search_semantic requires a query',
    );
  });
});
