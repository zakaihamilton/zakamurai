import type { NormalizedTreeNode } from '@/components/App/types';
import type { TreeNode } from '@/components/state/domain-types';

/** Cast partial tree fixture data for unit tests. */
export function asTreeNode(value: Partial<TreeNode> & Record<string, unknown>): TreeNode {
  return value as TreeNode;
}

/** Cast partial normalized tree fixture data for unit tests. */
export function asNormalizedTreeNode(
  value: Partial<NormalizedTreeNode> & Record<string, unknown>,
): NormalizedTreeNode {
  return value as NormalizedTreeNode;
}

export function makeTreeNode(
  name: string,
  type: 'file' | 'folder' = 'file',
  children?: TreeNode[],
): TreeNode {
  return {
    name,
    type,
    path: [name],
    ...(children ? { children } : {}),
  };
}

export function makeNormalizedTreeNode(
  name: string,
  type: 'file' | 'folder' = 'file',
  path: string[] = [name],
  children?: NormalizedTreeNode[],
): NormalizedTreeNode {
  return {
    name,
    type,
    path,
    ...(children ? { children } : {}),
  };
}

export function makeSampleTree(): NormalizedTreeNode[] {
  return [
    makeNormalizedTreeNode('src', 'folder', ['src'], [
      makeNormalizedTreeNode('index.js', 'file', ['src', 'index.js']),
      makeNormalizedTreeNode('App.js', 'file', ['src', 'App.js']),
    ]),
    makeNormalizedTreeNode('package.json', 'file', ['package.json']),
  ];
}
