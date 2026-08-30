import { describe, expect, it } from 'vitest';
import { hasValidAiChangeContent, isProjectRelativePath } from './ai';

describe('isProjectRelativePath', () => {
  it.each(['src/App.jsx', 'src/components/Todo.module.css', 'package.json'])('accepts %s', (path) =>
    expect(isProjectRelativePath(path)).toBe(true),
  );

  it.each([
    '/etc/passwd',
    '../secret.js',
    'src/../secret.js',
    'src/./App.jsx',
    './App.jsx',
    'C:\\secret.js',
    'src\\App.js',
    '',
    'src//App.jsx',
  ])('rejects %s', (path) => expect(isProjectRelativePath(path)).toBe(false));
});

describe('hasValidAiChangeContent', () => {
  it('accepts string content, after, or undefined after', () => {
    expect(hasValidAiChangeContent({ content: 'x' })).toBe(true);
    expect(hasValidAiChangeContent({ after: 'x' })).toBe(true);
    expect(hasValidAiChangeContent({ after: undefined })).toBe(true);
    expect(hasValidAiChangeContent({ after: 1 as unknown as string })).toBe(false);
  });
});
