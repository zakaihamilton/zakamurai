import { describe, expect, it, vi } from 'vitest';
import {
  validateAIChanges,
  validateContentSyntax,
  validateContentSyntaxAsync,
  validateProjectPath,
} from './ChangeValidator';

describe('AI change validation', () => {
  it('accepts a project-relative multi-file change set', () => {
    const result = validateAIChanges([
      { path: 'src/App.jsx', after: 'export default null' },
      { path: 'src/styles.css', after: 'body {}' },
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(2);
  });

  it.each(['/etc/passwd', '../secret.js', 'src/../secret.js', 'C:\\secret.js'])(
    'rejects unsafe path %s',
    (path) => expect(validateProjectPath(path)).toBeTruthy(),
  );

  it('rejects duplicate targets and malformed content', () => {
    const result = validateAIChanges([
      { path: 'src/a.js', after: 'one' },
      { path: 'src/a.js', after: 'two' },
      { path: 'src/b.js', after: 4 },
    ]);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(2);
  });

  it('rejects non-array payloads and missing paths', () => {
    expect(validateAIChanges(null).rejected).toEqual(['Changes must be an array.']);
    expect(validateAIChanges([{ after: 'code' }]).rejected[0]).toBe('A file path is required.');
  });

  it('rejects malformed syntax in proposals', () => {
    const result = validateAIChanges([
      { path: 'src/bad.json', after: '{ invalid json }' },
      { path: 'src/bad.js', after: 'function test() {' },
    ]);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0]).toContain('Invalid JSON syntax');
    expect(result.rejected[1]).toContain('Unclosed');
  });

  it('accepts code with comments containing unmatched brackets', () => {
    const codeWithComments = `
      // Single line comment with unclosed { bracket
      /* Multi-line comment with unclosed ( bracket */
      function valid() { return true; }
    `;
    expect(validateContentSyntax('src/app.js', codeWithComments)).toBeNull();
  });

  it('uses esbuildTransform when provided in validateContentSyntaxAsync', async () => {
    const mockEsbuild = vi.fn().mockImplementation((code) => {
      if (code.includes('syntaxError')) throw new Error('Unexpected token');
    });

    const validResult = await validateContentSyntaxAsync(
      'src/app.jsx',
      'const x = 1;',
      mockEsbuild,
    );
    expect(validResult).toBeNull();
    expect(mockEsbuild).toHaveBeenCalledWith('const x = 1;', { loader: 'jsx' });

    const invalidResult = await validateContentSyntaxAsync(
      'src/app.jsx',
      'const syntaxError = ;',
      mockEsbuild,
    );
    expect(invalidResult).toContain('Syntax error in src/app.jsx');
  });

  it('supports validateAIChangesAsync with structured details', async () => {
    const { validateAIChangesAsync } = await import('./ChangeValidator');
    const mockEsbuild = vi.fn().mockImplementation((code) => {
      if (code.includes('bad')) throw new Error('Transform failed');
    });

    const res = await validateAIChangesAsync(
      [
        { path: 'src/good.js', content: 'const a = 1;' },
        { path: 'src/bad.js', content: 'const bad = ;' },
      ],
      mockEsbuild,
    );

    expect(res.accepted).toHaveLength(1);
    expect(res.rejected).toHaveLength(1);
    expect(res.details[0].type).toBe('syntax');
    expect(res.details[0].path).toBe('src/bad.js');
  });
});
