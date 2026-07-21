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
    const retrieve = vi.fn().mockResolvedValue([
      { filePath: 'src/auth.js', content: 'function login() {}', score: 0.91 },
    ]);
    const result = await workspace.semanticSearch('authentication', retrieve, 3);
    expect(retrieve).toHaveBeenCalledWith('authentication', 3);
    expect(result).toContain('src/auth.js');
    expect(result).toContain('0.910');
  });
});
