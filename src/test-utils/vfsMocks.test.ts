import { describe, expect, it } from 'vitest';
import { createMinimalVfsLike, createMutableVfsLike } from './vfsMocks';

describe('vfsMocks', () => {
  describe('createMutableVfsLike', () => {
    it('reads, writes, lists, and removes files and directories', () => {
      const files: Record<string, string> = {
        'src/index.js': 'export {}',
        'src/utils/helper.js': 'helper',
      };
      const vfs = createMutableVfsLike(files);

      expect(vfs.existsSync('src/index.js')).toBe(true);
      expect(vfs.existsSync('src')).toBe(true);
      expect(vfs.readFileSync('src/index.js')).toBe('export {}');

      vfs.writeFileSync('src/new.js', 'new file');
      expect(files['src/new.js']).toBe('new file');

      vfs.writeFileSync('bin/data', new TextEncoder().encode('bytes'));
      expect(files['bin/data']).toBe('bytes');

      expect(vfs.readdirSync('src').sort()).toEqual(['index.js', 'new.js', 'utils']);

      const { unlinkSync, rmdirSync } = vfs;
      if (!unlinkSync || !rmdirSync) {
        throw new Error('expected mutable vfs delete helpers');
      }
      unlinkSync('src/new.js');
      expect(vfs.existsSync('src/new.js')).toBe(false);

      rmdirSync('src');
      expect(vfs.existsSync('src')).toBe(false);
      expect(vfs.existsSync('src/index.js')).toBe(false);
    });

    it('throws for missing files and directory read errors', () => {
      const vfs = createMutableVfsLike({ 'file.txt': 'x' });
      expect(() => vfs.readFileSync('missing.txt')).toThrow(/ENOENT/);
      expect(() => vfs.readdirSync('file.txt')).toThrow(/ENOTDIR/);
    });
  });

  describe('createMinimalVfsLike', () => {
    it('uses overrides while keeping noop defaults', () => {
      const vfs = createMinimalVfsLike({
        existsSync: (path) => path === 'only.js',
        readFileSync: (path) => `content:${path}`,
      });

      expect(vfs.existsSync('only.js')).toBe(true);
      expect(vfs.readFileSync('only.js')).toBe('content:only.js');
      expect(vfs.readdirSync('.')).toEqual([]);
      vfs.writeFileSync('ignored.js', 'noop');
    });
  });
});
