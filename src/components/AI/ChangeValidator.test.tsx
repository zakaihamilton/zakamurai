import * as fc from 'fast-check';
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
      { path: 'src/b.js', after: 4 as unknown as string },
    ]);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(2);
  });

  it('rejects non-array payloads and missing paths', () => {
    expect(validateAIChanges(null as never).rejected).toEqual(['Changes must be an array.']);
    expect(validateAIChanges([{ path: '', after: 'code' }]).rejected[0]).toBe(
      'A file path is required.',
    );
  });

  it('rejects empty and non-string paths', () => {
    expect(validateProjectPath('')).toBe('A file path is required.');
    expect(validateProjectPath('   ')).toBe('A file path is required.');
    expect(validateProjectPath(null as never)).toBe('A file path is required.');
    expect(validateProjectPath(42 as never)).toBe('A file path is required.');
  });

  it('accepts changes using the filePath alias', () => {
    const result = validateAIChanges([
      { path: 'src/alias.js', filePath: 'src/alias.js', after: 'export default 1' },
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(1);
  });

  it('reports CSS brace and parenthesis errors', () => {
    expect(validateContentSyntax('src/style.css', '.class { color: red;')).toContain('Unclosed');
    expect(validateContentSyntax('src/style.css', '.class { background: url(; }')).toContain(
      'Unmatched',
    );
  });

  it('ignores brackets inside template literals and comments', () => {
    const withTemplate = 'const x = `value { not a brace`; function ok() { return 1; }';
    expect(validateContentSyntax('src/app.js', withTemplate)).toBeNull();
    const withBacktickComment = 'const s = `// fake comment {`; const ok = () => {};';
    expect(validateContentSyntax('src/app.ts', withBacktickComment)).toBeNull();
  });

  it('returns null for non-string content or missing path in sync validation', () => {
    expect(validateContentSyntax('src/app.js', null as never)).toBeNull();
    expect(validateContentSyntax('', 'const x = 1;')).toBeNull();
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

    await validateContentSyntaxAsync('src/app.ts', 'const n: number = 1;', mockEsbuild);
    expect(mockEsbuild).toHaveBeenCalledWith('const n: number = 1;', { loader: 'ts' });

    await validateContentSyntaxAsync(
      'src/app.tsx',
      'export const El = () => <div />;',
      mockEsbuild,
    );
    expect(mockEsbuild).toHaveBeenCalledWith('export const El = () => <div />;', { loader: 'tsx' });

    await validateContentSyntaxAsync('src/app.js', 'const x = 1;', mockEsbuild);
    expect(mockEsbuild).toHaveBeenCalledWith('const x = 1;', { loader: 'js' });
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
    expect(res.details?.[0]?.type).toBe('syntax');
    expect(res.details?.[0]?.path).toBe('src/bad.js');
  });

  it('validateAIChangesAsync reports path, conflict, and content errors', async () => {
    const { validateAIChangesAsync } = await import('./ChangeValidator');

    const res = await validateAIChangesAsync([
      { path: '/absolute.js', filePath: '/absolute.js', content: 'x' },
      { path: 'src/a.js', content: 'first' },
      { path: 'src/a.js', content: 'second' },
      { path: 'src/b.js', after: 42 as unknown as string },
    ]);

    expect(res.accepted).toHaveLength(1);
    expect(res.rejected).toHaveLength(3);
    expect(res.details?.map((d) => d.type)).toEqual(['path', 'conflict', 'content']);
    expect(res.details?.[0]?.path).toBe('/absolute.js');
  });

  it('validateAIChangesAsync rejects non-array input', async () => {
    const { validateAIChangesAsync } = await import('./ChangeValidator');
    const res = await validateAIChangesAsync('not-array' as never);
    expect(res.accepted).toEqual([]);
    expect(res.rejected).toEqual(['Changes must be an array.']);
    expect(res.details).toEqual([]);
  });

  it('rejects all generated absolute and traversal paths (property)', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ minLength: 1 }).map((segment) => `/${segment}`),
          fc.string({ minLength: 1 }).map((segment) => `../${segment}`),
          fc.string({ minLength: 1 }).map((segment) => `src/../${segment}`),
          fc.string({ minLength: 1 }).map((segment) => `C:\\${segment}`),
        ),
        (unsafePath) => {
          expect(validateProjectPath(unsafePath)).toBeTruthy();
        },
      ),
    );
  });

  it('accepts simple project-relative paths (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z][a-z0-9_-]*$/), { minLength: 1, maxLength: 4 }),
        (segments) => {
          const path = segments.join('/');
          expect(validateProjectPath(path)).toBeNull();
        },
      ),
    );
  });
});
