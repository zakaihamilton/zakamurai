import { describe, expect, it } from 'vitest';
import { validateAIChanges, validateProjectPath } from './ChangeValidator';

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
});
