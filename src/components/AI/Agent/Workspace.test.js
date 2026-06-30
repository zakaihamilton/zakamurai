import { describe, expect, it } from 'vitest';
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
});
