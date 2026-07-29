import type { FlatTreeRow } from '@/components/App/types';
import { asNormalizedTreeNode, asTreeNode, makeNormalizedTreeNode, makeTreeNode } from '@/test-utils/treeMocks';
import { describe, expect, it, vi } from 'vitest';
import {
  addNodeAtPath,
  findNodeAtPath,
  flattenTree,
  getInitialFileContents,
  getNodeType,
  getPathStr,
  insertCreateRow,
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
      expect(getNodeType(asTreeNode({ type: 'folder' }))).toBe('folder');
      expect(getNodeType(asTreeNode({ type: 'file' }))).toBe('file');
    });

    it('determines type by kind if type is absent', () => {
      expect(getNodeType(asTreeNode({ kind: 'directory' }))).toBe('folder');
      expect(getNodeType(asTreeNode({ kind: 'file' }))).toBe('file');
    });

    it('defaults to file if neither is present', () => {
      expect(getNodeType(asTreeNode({ name: 'unknown' }))).toBe('file');
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
      expect(isNodeModulesPath(['project', 'node_modules', 'react'])).toBe(true);
      expect(isNodeModulesPath(['project', 'src', 'index.js'])).toBe(false);
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
      const a = makeTreeNode('folderA', 'folder');
      const b = makeTreeNode('fileB', 'file');
      expect(treeSorter(a, b)).toBe(-1);
      expect(treeSorter(b, a)).toBe(1);
    });

    it('sorts alphabetically and numerically if types match', () => {
      const a = makeTreeNode('file10', 'file');
      const b = makeTreeNode('file2', 'file');
      expect(treeSorter(a, b)).toBeGreaterThan(0);
    });
  });

  describe('normalizeChildren', () => {
    it('sorts nodes and adds type and path attributes', () => {
      const rawNodes = [
        asTreeNode({ name: 'App.js', kind: 'file' }),
        asTreeNode({
          name: 'components',
          kind: 'directory',
          children: [asTreeNode({ name: 'Button.js', kind: 'file' })],
        }),
      ];
      const normalized = normalizeChildren(rawNodes, ['src']);

      expect(normalized[0]!.name).toBe('components');
      expect(normalized[0]!.type).toBe('folder');
      expect(normalized[0]!.path).toEqual(['src', 'components']);
      expect(normalized[0]!.children![0]!.name).toBe('Button.js');
      expect(normalized[0]!.children![0]!.type).toBe('file');
      expect(normalized[0]!.children![0]!.path).toEqual(['src', 'components', 'Button.js']);

      expect(normalized[1]!.name).toBe('App.js');
      expect(normalized[1]!.type).toBe('file');
      expect(normalized[1]!.path).toEqual(['src', 'App.js']);
    });
  });

  describe('setChildrenAtPath', () => {
    it('updates child nodes at specified path', () => {
      const tree = [
        makeTreeNode('src', 'folder', [
          makeTreeNode('components', 'folder', []),
        ]),
      ];
      const newChildren = [makeTreeNode('Button.js', 'file')];
      const result = setChildrenAtPath(tree, ['src', 'components'], newChildren);

      expect(result[0]!.children![0]!.children).toEqual(newChildren);
    });

    it('returns custom children if path is empty', () => {
      const custom = [makeTreeNode('root', 'file')];
      expect(setChildrenAtPath([], [], custom)).toEqual(custom);
    });
  });

  describe('renameNodeAtPath', () => {
    it('renames a node at specified path', () => {
      const tree = [
        makeNormalizedTreeNode('src', 'folder', ['src'], [
          makeNormalizedTreeNode('App.js', 'file', ['src', 'App.js']),
        ]),
      ];
      const result = renameNodeAtPath(tree, ['src', 'App.js'], 'index.js');
      expect(result[0]!.children![0]!.name).toBe('index.js');
      expect(result[0]!.children![0]!.path).toEqual(['src', 'index.js']);
    });
  });

  describe('addNodeAtPath', () => {
    it('adds node at specified path and sorts the collection', () => {
      const tree = [makeTreeNode('src', 'folder', [])];
      const newNode = asTreeNode({ name: 'App.js', kind: 'file' });
      const result = addNodeAtPath(tree, ['src'], newNode);

      expect(result[0]!.children![0]!.name).toBe('App.js');
      expect(result[0]!.children![0]!.type).toBe('file');
    });

    it('normalizes and appends if path is empty', () => {
      const result = addNodeAtPath([], [], asTreeNode({ name: 'index.js', kind: 'file' }));
      expect(result[0]!.name).toBe('index.js');
    });
  });

  describe('removeNodeAtPath', () => {
    it('removes a node at specified path', () => {
      const tree = [
        makeTreeNode('src', 'folder', [
          makeTreeNode('App.js', 'file'),
          makeTreeNode('index.js', 'file'),
        ]),
      ];
      const result = removeNodeAtPath(tree, ['src', 'App.js']);
      expect(result[0]!.children).toHaveLength(1);
      expect(result[0]!.children![0]!.name).toBe('index.js');
    });
  });

  describe('findNodeAtPath', () => {
    it('finds node at path and returns null if not found', () => {
      const tree = [
        makeTreeNode('src', 'folder', [makeTreeNode('App.js', 'file')]),
      ];

      expect(findNodeAtPath(tree, ['src', 'App.js'])).toBeDefined();
      expect(findNodeAtPath(tree, ['src', 'App.js'])!.name).toBe('App.js');
      expect(findNodeAtPath(tree, ['src', 'non-existent'])).toBeNull();
    });
  });

  describe('flattenTree', () => {
    const tree = [
      makeNormalizedTreeNode('src', 'folder', ['src'], [
        makeNormalizedTreeNode('components', 'folder', ['src', 'components'], []),
        makeNormalizedTreeNode('App.js', 'file', ['src', 'App.js']),
      ]),
      makeNormalizedTreeNode('package.json', 'file', ['package.json']),
    ];

    it('flattens tree elements including folders', () => {
      const flat = flattenTree(tree, {}, '');
      expect(flat).toHaveLength(4);
      expect(flat[0]!.key).toBe('src');
      expect(flat[1]!.key).toBe('src/components');
      expect(flat[2]!.key).toBe('src/App.js');
      expect(flat[3]!.key).toBe('package.json');
    });

    it('filters rows based on text match', () => {
      const flat = flattenTree(tree, {}, 'App');
      expect(flat).toHaveLength(2);
      expect(flat[1]!.key).toBe('src/App.js');
    });

    it('filters rows based on wildcard extension matching (*.js)', () => {
      const flat = flattenTree(tree, {}, '*.js');
      expect(flat).toHaveLength(2);
      expect(flat[1]!.key).toBe('src/App.js');
      expect(flat.map((f) => f.key)).not.toContain('package.json');
    });

    it('filters rows based on wildcard folder matching (src/*)', () => {
      const flat = flattenTree(tree, {}, 'src/*');
      expect(flat.map((f) => f.key)).toContain('src/App.js');
      expect(flat.map((f) => f.key)).toContain('src/components');
      expect(flat.map((f) => f.key)).not.toContain('package.json');
    });
  });

  describe('insertCreateRow', () => {
    const rows = [
      {
        key: '__root__',
        pathStr: '',
        level: 0,
        path: [],
        item: makeTreeNode('Project', 'folder'),
      },
      {
        key: 'src',
        pathStr: 'src',
        level: 1,
        path: ['src'],
        item: makeTreeNode('src', 'folder'),
      },
      {
        key: 'src/App.js',
        pathStr: 'src/App.js',
        level: 2,
        path: ['src', 'App.js'],
        item: makeTreeNode('App.js', 'file'),
      },
    ] as FlatTreeRow[] as Parameters<typeof insertCreateRow>[0];

    it('inserts create row immediately after the parent folder', () => {
      const next = insertCreateRow(rows, { pathStr: 'src', type: 'file' });
      expect(next).toHaveLength(4);
      expect(next[2]!.isCreateRow).toBe(true);
      expect(next[2]!.createType).toBe('file');
      expect(next[2]!.level).toBe(2);
      expect(next[2]!.parentRow).toBe(rows[1]);
      expect(next[3]!.key).toBe('src/App.js');
    });

    it('inserts create row after the project root', () => {
      const next = insertCreateRow(rows, { pathStr: '', type: 'folder' });
      expect(next).toHaveLength(4);
      expect(next[1]!.isCreateRow).toBe(true);
      expect(next[1]!.createType).toBe('folder');
      expect(next[1]!.level).toBe(1);
      expect(next[2]!.key).toBe('src');
    });

    it('returns original rows when creatingAt is null', () => {
      expect(insertCreateRow(rows, null)).toBe(rows);
    });

    it('returns original rows when parent is not found', () => {
      expect(insertCreateRow(rows, { pathStr: 'missing', type: 'file' })).toBe(rows);
    });
  });
});
