import { DEFAULT_CONTENTS, SCRATCH_CONTENTS } from '@/components/Storage/InitialData';
import Settings from '@/components/Storage/Settings';

export const getNodeType = (node) => node.type || (node.kind === 'directory' ? 'folder' : 'file');

export const getPathStr = (path) => path.join('/');

export const isNodeModulesPath = (path) => path.includes('node_modules');

export const getInitialFileContents = () =>
  Settings.getTemplate() === 'scratch' ? SCRATCH_CONTENTS : DEFAULT_CONTENTS;

export const treeSorter = (a, b) => {
  const aType = getNodeType(a);
  const bType = getNodeType(b);
  if (aType === bType) return a.name.localeCompare(b.name, undefined, { numeric: true });
  return aType === 'folder' ? -1 : 1;
};

export const normalizeChildren = (nodes = [], parentPath = []) =>
  [...nodes].sort(treeSorter).map((node) => {
    const type = getNodeType(node);
    const path = node.path || [...parentPath, node.name];
    return {
      ...node,
      type,
      path,
      children: node.children ? normalizeChildren(node.children, path) : node.children,
    };
  });

export const setChildrenAtPath = (nodes, path, children) => {
  if (path.length === 0) return children;
  return nodes.map((node) => {
    if (node.name !== path[0]) return node;
    const nextChildren = setChildrenAtPath(node.children || [], path.slice(1), children);
    return { ...node, children: nextChildren };
  });
};

export const renameNodeAtPath = (nodes, path, name) =>
  nodes.map((node) => {
    if (node.name !== path[0]) return node;
    if (path.length === 1) return { ...node, name, path: [...node.path.slice(0, -1), name] };
    return { ...node, children: renameNodeAtPath(node.children || [], path.slice(1), name) };
  });

export const addNodeAtPath = (nodes, path, node) => {
  if (path.length === 0) return normalizeChildren([...nodes, node]);
  return nodes.map((current) => {
    if (current.name !== path[0]) return current;
    return { ...current, children: addNodeAtPath(current.children || [], path.slice(1), node) };
  });
};

export const removeNodeAtPath = (nodes, path) => {
  if (path.length === 1) return nodes.filter((node) => node.name !== path[0]);
  return nodes.map((node) => {
    if (node.name !== path[0]) return node;
    return { ...node, children: removeNodeAtPath(node.children || [], path.slice(1)) };
  });
};

export const findNodeAtPath = (nodes, path) => {
  let level = nodes;
  let found = null;
  for (const segment of path) {
    found = level?.find((node) => node.name === segment);
    if (!found) return null;
    level = found.children;
  }
  return found;
};

export const flattenTree = (nodes, expandedFolders, filterText, parentPath = [], level = 1) => {
  const query = filterText.trim().toLowerCase();
  const rows = [];

  for (const node of nodes) {
    const path = node.path || [...parentPath, node.name];
    const pathStr = getPathStr(path);
    const pathMatches = pathStr.toLowerCase().includes(query);
    const childrenRows =
      node.children && (query || expandedFolders[pathStr] !== false)
        ? flattenTree(node.children, expandedFolders, filterText, path, level + 1)
        : [];

    if (!query || pathMatches || childrenRows.length > 0) {
      rows.push({ key: pathStr, item: node, level, path, pathStr });
      rows.push(...childrenRows);
    }
  }

  return rows;
};
