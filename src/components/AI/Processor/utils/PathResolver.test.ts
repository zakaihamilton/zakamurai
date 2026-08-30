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

    test('longest suffix match with multiple candidates', () => {
      const candidates = ['other/components/Button.js', 'new-path/components/Button.js'];
      expect(resolveFilePath('parent/new-path/components/Button.js', candidates)).toBe(
        'new-path/components/Button.js',
      );
    });

    test('fallback to provided path', () => {
      expect(resolveFilePath('new/file.js', existing)).toBe('new/file.js');
    });

    test('does not remap traversal or remaining dot-segment paths onto existing files', () => {
      expect(resolveFilePath('../App.js', existing)).toBe('../App.js');
      expect(resolveFilePath('src/./App.js', existing)).toBe('src/./App.js');
    });

    test('resolves new component paths into src directory when src exists', () => {
      const srcExisting = ['src/App.jsx', 'src/main.jsx'];
      expect(resolveFilePath('components/Todo.jsx', srcExisting)).toBe('src/components/Todo.jsx');
      expect(resolveFilePath('Todo.jsx', srcExisting)).toBe('src/components/Todo.jsx');
      expect(resolveFilePath('Todo.module.css', srcExisting)).toBe(
        'src/components/Todo.module.css',
      );
      expect(resolveFilePath('index.css', srcExisting)).toBe('src/index.css');
    });
  });
});
