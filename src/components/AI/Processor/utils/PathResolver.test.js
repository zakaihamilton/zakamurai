import { describe, expect, test } from 'vitest';
import { resolveFilePath } from './PathResolver';

describe('PathResolver', () => {
  describe('resolveFilePath', () => {
    const existing = ['src/App.js', 'src/components/Button.js', 'index.html'];

    test('exact match', () => {
      expect(resolveFilePath('src/App.js', existing)).toBe('src/App.js');
    });

    test('normalized match', () => {
      expect(resolveFilePath('./src/App.js', existing)).toBe('src/App.js');
    });

    test('unique filename match', () => {
      expect(resolveFilePath('Button.js', existing)).toBe('src/components/Button.js');
    });

    test('longest suffix match', () => {
      expect(resolveFilePath('components/Button.js', existing)).toBe('src/components/Button.js');
    });

    test('fallback to provided path', () => {
      expect(resolveFilePath('new/file.js', existing)).toBe('new/file.js');
    });
  });
});
