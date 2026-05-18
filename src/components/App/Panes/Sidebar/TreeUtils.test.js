import { describe, expect, it, vi } from 'vitest';
import {
  addNodeAtPath,
  findNodeAtPath,
  flattenTree,
  getInitialFileContents,
  getNodeType,
  getPathStr,
  isNodeModulesPath,
  normalizeChildren,
  removeNodeAtPath,
  renameNodeAtPath,
  setChildrenAtPath,
  treeSorter,
} from './TreeUtils';

vi.mock('@/components/Storage/Settings', () => ({
  default: {
    getTemplate: vi.fn(),
  },
}));

describe('TreeUtils', () => {
  describe('getNodeType', () => {
    it('returns explicit type if present', () => {
      expect(getNodeType({ type: 'folder' })).toBe('folder');
      expect(getNodeType({ type: 'file' })).toBe('file');
    });

    it('determines type by kind if type is absent', () => {
      expect(getNodeType({ kind: 'directory' })).toBe('folder');
      expect(getNodeType({ kind: 'file' })).toBe('file');
    });

    it('defaults to file if neither is present', () => {
      expect(getNodeType({ name: 'unknown' })).toBe('file');
    });
  });

  describe('getPathStr', () => {
    it('joins path array segments with forward slash', () => {
      expect(getPathStr(['src', 'components', 'App.js'])).toBe('src/components/App.js');
      expect(getPathStr([])).toBe('');
    });
  });

  describe('isNodeModulesPath', () => {
    it('returns true if node_modules is in path', () => {
      expect(isNodeModulesPath('project/node_modules/react')).toBe(true);
      expect(isNodeModulesPath('project/src/index.js')).toBe(false);
    });
  });

  describe('getInitialFileContents', () => {
    it('returns template content based on Settings', async () => {
      const Settings = (await import('@/components/Storage/Settings')).default;

      vi.mocked(Settings.getTemplate).mockReturnValue('scratch');
      expect(getInitialFileContents()).toBeDefined();

      vi.mocked(Settings.getTemplate).mockReturnValue('default');
      expect(getInitialFileContents()).toBeDefined();
    });
  });

  describe('treeSorter', () => {
    it('sorts folders before files', () => {
      const a = { name: 'folderA', type: 'folder' };
      const b = { name: 'fileB', type: 'file' };
      expect(treeSorter(a, b)).toBe(-1);
      expect(treeSorter(b, a)).toBe(1);
    });

    it('sorts alphabetically and numerically if types match', () => {
      const a = { name: 'file10', type: 'file' };
      const b = { name: 'file2', type: 'file' };
      expect(treeSorter(a, b)).toBeGreaterThan(0); // numeric comparison: 10 > 2
    });
  });

  describe('normalizeChildren', () => {
    it('sorts nodes and adds type and path attributes', () => {
      const rawNodes = [
        { name: 'App.js', kind: 'file' },
        { name: 'components', kind: 'directory', children: [{ name: 'Button.js', kind: 'file' }] },
      ];
      const normalized = normalizeChildren(rawNodes, ['src']);

      expect(normalized[0].name).toBe('components');
      expect(normalized[0].type).toBe('folder');
      expect(normalized[0].path).toEqual(['src', 'components']);
      expect(normalized[0].children[0].name).toBe('Button.js');
      expect(normalized[0].children[0].type).toBe('file');
      expect(normalized[0].children[0].path).toEqual(['src', 'components', 'Button.js']);

      expect(normalized[1].name).toBe('App.js');
      expect(normalized[1].type).toBe('file');
      expect(normalized[1].path).toEqual(['src', 'App.js']);
    });
  });

  describe('setChildrenAtPath', () => {
    it('updates child nodes at specified path', () => {
      const tree = [
        {
          name: 'src',
          type: 'folder',
          children: [{ name: 'components', type: 'folder', children: [] }],
        },
      ];
      const newChildren = [{ name: 'Button.js', type: 'file' }];
      const result = setChildrenAtPath(tree, ['src', 'components'], newChildren);

      expect(result[0].children[0].children).toEqual(newChildren);
    });

    it('returns custom children if path is empty', () => {
      const custom = [{ name: 'root', type: 'file' }];
      expect(setChildrenAtPath([], [], custom)).toEqual(custom);
    });
  });

  describe('renameNodeAtPath', () => {
    it('renames a node at specified path', () => {
      const tree = [
        {
          name: 'src',
          type: 'folder',
          path: ['src'],
          children: [{ name: 'App.js', type: 'file', path: ['src', 'App.js'] }],
        },
      ];
      const result = renameNodeAtPath(tree, ['src', 'App.js'], 'index.js');
      expect(result[0].children[0].name).toBe('index.js');
      expect(result[0].children[0].path).toEqual(['src', 'index.js']);
    });
  });

  describe('addNodeAtPath', () => {
    it('adds node at specified path and sorts the collection', () => {
      const tree = [
        {
          name: 'src',
          type: 'folder',
          children: [],
        },
      ];
      const newNode = { name: 'App.js', kind: 'file' };
      const result = addNodeAtPath(tree, ['src'], newNode);

      expect(result[0].children[0].name).toBe('App.js');
      expect(result[0].children[0].type).toBe('file');
    });

    it('normalizes and appends if path is empty', () => {
      const result = addNodeAtPath([], [], { name: 'index.js', kind: 'file' });
      expect(result[0].name).toBe('index.js');
    });
  });

  describe('removeNodeAtPath', () => {
    it('removes a node at specified path', () => {
      const tree = [
        {
          name: 'src',
          type: 'folder',
          children: [
            { name: 'App.js', type: 'file' },
            { name: 'index.js', type: 'file' },
          ],
        },
      ];
      const result = removeNodeAtPath(tree, ['src', 'App.js']);
      expect(result[0].children.length).toBe(1);
      expect(result[0].children[0].name).toBe('index.js');
    });
  });

  describe('findNodeAtPath', () => {
    it('finds node at path and returns null if not found', () => {
      const tree = [
        {
          name: 'src',
          type: 'folder',
          children: [{ name: 'App.js', type: 'file' }],
        },
      ];

      expect(findNodeAtPath(tree, ['src', 'App.js'])).toBeDefined();
      expect(findNodeAtPath(tree, ['src', 'App.js']).name).toBe('App.js');
      expect(findNodeAtPath(tree, ['src', 'non-existent'])).toBeNull();
    });
  });

  describe('flattenTree', () => {
    const tree = [
      {
        name: 'src',
        type: 'folder',
        path: ['src'],
        children: [
          { name: 'components', type: 'folder', path: ['src', 'components'], children: [] },
          { name: 'App.js', type: 'file', path: ['src', 'App.js'] },
        ],
      },
      { name: 'package.json', type: 'file', path: ['package.json'] },
    ];

    it('flattens tree elements including folders', () => {
      const flat = flattenTree(tree, {}, '');
      expect(flat.length).toBe(4);
      expect(flat[0].key).toBe('src');
      expect(flat[1].key).toBe('src/components');
      expect(flat[2].key).toBe('src/App.js');
      expect(flat[3].key).toBe('package.json');
    });

    it('filters rows based on text match', () => {
      const flat = flattenTree(tree, {}, 'App');
      expect(flat.length).toBe(2); // 'src' matches because child matches or path matches
      expect(flat[1].key).toBe('src/App.js');
    });
  });
});
