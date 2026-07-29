import type { FlatTreeRow, NormalizedTreeNode } from '@/components/App/types';
import type { TreeNode } from '@/components/state/domain-types';
import { DEFAULT_CONTENTS, SCRATCH_CONTENTS } from '@/components/Storage/InitialData';
import Settings from '@/components/Storage/Settings';

type TreeMatcher = (pathStr: string) => boolean;

type FlattenRow = FlatTreeRow & {
  key: string;
  isCreateRow?: boolean;
  createType?: string;
  parentRow?: FlattenRow;
};

export const getNodeType = (node: TreeNode): 'file' | 'folder' =>
  (node.type as 'file' | 'folder') || (node.kind === 'directory' ? 'folder' : 'file');

export const getPathStr = (path: string[]): string => path.join('/');

export const isNodeModulesPath = (path: string[]): boolean => path.includes('node_modules');

export const getInitialFileContents = (): Record<string, string> =>
  Settings.getTemplate() === 'scratch' ? SCRATCH_CONTENTS : DEFAULT_CONTENTS;

export const treeSorter = (a: TreeNode, b: TreeNode): number => {
  const aType = getNodeType(a);
  const bType = getNodeType(b);
  if (aType === bType) return a.name.localeCompare(b.name, undefined, { numeric: true });
  return aType === 'folder' ? -1 : 1;
};

export const normalizeChildren = (
  nodes: TreeNode[] = [],
  parentPath: string[] = [],
): NormalizedTreeNode[] =>
  [...nodes].sort(treeSorter).map((node) => {
    const type = getNodeType(node);
    const nodePath = node.path || [...parentPath, node.name];
    return {
      ...node,
      type,
      path: nodePath,
      children: node.children ? normalizeChildren(node.children, nodePath) : node.children,
    } as NormalizedTreeNode;
  });

export const setChildrenAtPath = (
  nodes: TreeNode[],
  path: string[],
  children: TreeNode[],
): TreeNode[] => {
  if (path.length === 0) return children;
  return nodes.map((node) => {
    if (node.name !== path[0]) return node;
    const nextChildren = setChildrenAtPath(node.children || [], path.slice(1), children);
    return { ...node, children: nextChildren };
  });
};

export const renameNodeAtPath = (
  nodes: TreeNode[],
  path: string[],
  name: string,
): TreeNode[] =>
  nodes.map((node) => {
    if (node.name !== path[0]) return node;
    const nodePath = node.path || path;
    if (path.length === 1) return { ...node, name, path: [...nodePath.slice(0, -1), name] };
    return { ...node, children: renameNodeAtPath(node.children || [], path.slice(1), name) };
  });

export const addNodeAtPath = (nodes: TreeNode[], path: string[], node: TreeNode): TreeNode[] => {
  if (path.length === 0) return normalizeChildren([...nodes, node]);
  return nodes.map((current) => {
    if (current.name !== path[0]) return current;
    return { ...current, children: addNodeAtPath(current.children || [], path.slice(1), node) };
  });
};

export const removeNodeAtPath = (nodes: TreeNode[], path: string[]): TreeNode[] => {
  if (path.length === 1) return nodes.filter((node) => node.name !== path[0]);
  return nodes.map((node) => {
    if (node.name !== path[0]) return node;
    return { ...node, children: removeNodeAtPath(node.children || [], path.slice(1)) };
  });
};

export const findNodeAtPath = (nodes: TreeNode[], path: string[]): TreeNode | null => {
  let level: TreeNode[] | undefined = nodes;
  let found: TreeNode | null = null;
  for (const segment of path) {
    found = level?.find((node) => node.name === segment) ?? null;
    if (!found) return null;
    level = found.children;
  }
  return found;
};

export const flattenTree = (
  nodes: NormalizedTreeNode[],
  expandedFolders: Record<string, boolean>,
  filterText: string,
  parentPath: string[] = [],
  level = 1,
  matcher: TreeMatcher | null = null,
): FlattenRow[] => {
  const query = filterText.trim().toLowerCase();
  const rows: FlattenRow[] = [];

  if (!query) {
    for (const node of nodes) {
      const nodePath = node.path || [...parentPath, node.name];
      const pathStr = getPathStr(nodePath);
      const childrenRows =
        node.children && expandedFolders[pathStr] !== false
          ? flattenTree(
              node.children as NormalizedTreeNode[],
              expandedFolders,
              filterText,
              nodePath,
              level + 1,
              null,
            )
          : [];
      rows.push({ key: pathStr, item: node, level, path: nodePath, pathStr });
      rows.push(...childrenRows);
    }
    return rows;
  }

  let currentMatcher = matcher;
  if (!currentMatcher) {
    if (query.includes('*')) {
      try {
        const escaped = query.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        const regexStr = `^${escaped.replace(/\*/g, '.*')}$`;
        const regex = new RegExp(regexStr, 'i');
        currentMatcher = (pathStr: string) => regex.test(pathStr);
      } catch {
        currentMatcher = (pathStr: string) => pathStr.toLowerCase().includes(query);
      }
    } else {
      currentMatcher = (pathStr: string) => pathStr.toLowerCase().includes(query);
    }
  }

  for (const node of nodes) {
    const nodePath = node.path || [...parentPath, node.name];
    const pathStr = getPathStr(nodePath);
    const pathMatches = currentMatcher(pathStr);
    const childrenRows = node.children
      ? flattenTree(
          node.children as NormalizedTreeNode[],
          expandedFolders,
          filterText,
          nodePath,
          level + 1,
          currentMatcher,
        )
      : [];

    if (pathMatches || childrenRows.length > 0) {
      rows.push({ key: pathStr, item: node, level, path: nodePath, pathStr });
      rows.push(...childrenRows);
    }
  }

  return rows;
};

export const insertCreateRow = (
  rows: FlattenRow[],
  creatingAt: { pathStr: string; type: string } | null,
): FlattenRow[] => {
  if (!creatingAt) return rows;

  const parentIndex = rows.findIndex(
    (row) => !row.isCreateRow && row.pathStr === creatingAt.pathStr,
  );
  if (parentIndex === -1) return rows;

  const parent = rows[parentIndex];
  const createRow: FlattenRow = {
    key: `${creatingAt.pathStr}::__create__`,
    isCreateRow: true,
    createType: creatingAt.type,
    level: parent.level + 1,
    path: parent.path,
    pathStr: creatingAt.pathStr,
    parentRow: parent,
    item: parent.item,
  };

  return [...rows.slice(0, parentIndex + 1), createRow, ...rows.slice(parentIndex + 1)];
};
