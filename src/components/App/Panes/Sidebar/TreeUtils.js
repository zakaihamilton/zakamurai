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

export const flattenTree = (
  nodes,
  expandedFolders,
  filterText,
  parentPath = [],
  level = 1,
  matcher = null,
) => {
  const query = filterText.trim().toLowerCase();
  const rows = [];

  if (!query) {
    for (const node of nodes) {
      const path = node.path || [...parentPath, node.name];
      const pathStr = getPathStr(path);
      const childrenRows =
        node.children && expandedFolders[pathStr] !== false
          ? flattenTree(node.children, expandedFolders, filterText, path, level + 1, null)
          : [];
      rows.push({ key: pathStr, item: node, level, path, pathStr });
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
        currentMatcher = (pathStr) => regex.test(pathStr);
      } catch (_e) {
        currentMatcher = (pathStr) => pathStr.toLowerCase().includes(query);
      }
    } else {
      currentMatcher = (pathStr) => pathStr.toLowerCase().includes(query);
    }
  }

  for (const node of nodes) {
    const path = node.path || [...parentPath, node.name];
    const pathStr = getPathStr(path);
    const pathMatches = currentMatcher(pathStr);
    const childrenRows = node.children
      ? flattenTree(node.children, expandedFolders, filterText, path, level + 1, currentMatcher)
      : [];

    if (pathMatches || childrenRows.length > 0) {
      rows.push({ key: pathStr, item: node, level, path, pathStr });
      rows.push(...childrenRows);
    }
  }

  return rows;
};

export const insertCreateRow = (rows, creatingAt) => {
  if (!creatingAt) return rows;

  const parentIndex = rows.findIndex((row) => !row.isCreateRow && row.pathStr === creatingAt.pathStr);
  if (parentIndex === -1) return rows;

  const parent = rows[parentIndex];
  const createRow = {
    key: `${creatingAt.pathStr}::__create__`,
    isCreateRow: true,
    createType: creatingAt.type,
    level: parent.level + 1,
    path: parent.path,
    pathStr: creatingAt.pathStr,
    parentRow: parent,
  };

  return [...rows.slice(0, parentIndex + 1), createRow, ...rows.slice(parentIndex + 1)];
};
