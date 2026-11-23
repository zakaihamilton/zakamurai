import type {
  FlatTreeRow,
  NormalizedTreeNode,
  SidebarFileLoaderParams,
} from '@/components/App/types';
import type { TreeNode } from '@/types/domain-types';
import { useCallback, useRef } from 'react';
import {
  findNodeAtPath,
  getPathStr,
  isNodeModulesPath,
  mergeFileSystemTree,
  normalizeChildren,
  setChildrenAtPath,
} from './TreeUtils';

export type SidebarRow = FlatTreeRow & {
  item: NormalizedTreeNode & {
    isRoot?: boolean;
    handle?: FileSystemFileHandle | FileSystemDirectoryHandle | null;
  };
};

export type ToggleOptions = {
  expandOnly?: boolean;
};

export type WorkspaceSnapshot = {
  rootHandle: FileSystemDirectoryHandle | null;
  mode: string | null;
  epoch: number;
};

export function useSidebarDirectoryLoader({
  fs,
  sidebarState,
  editorState,
  setLoadingPaths,
  captureWorkspace,
  isCurrentWorkspace,
}: Pick<SidebarFileLoaderParams, 'fs' | 'sidebarState' | 'editorState' | 'setLoadingPaths'> & {
  captureWorkspace: () => WorkspaceSnapshot;
  isCurrentWorkspace: (token: WorkspaceSnapshot) => boolean;
}) {
  const { expandedFolders = {} } = sidebarState;
  const folderLoadRequestRef = useRef(new Map<string, number>());

  const loadChildren = useCallback(
    async (row: SidebarRow, force = false) => {
      if (fs.mode !== 'local' || row.item.type !== 'folder' || !row.item.handle) return;
      if (!force && row.item.children && row.item.childrenLoaded !== false) return;
      const workspace = captureWorkspace();
      const rootHandle = fs.rootHandle;
      const requestId = (folderLoadRequestRef.current.get(row.pathStr) || 0) + 1;
      folderLoadRequestRef.current.set(row.pathStr, requestId);
      setLoadingPaths((current: Record<string, boolean>) => ({ ...current, [row.pathStr]: true }));
      try {
        const entries: Array<{
          name: string;
          kind: FileSystemHandleKind;
          handle: FileSystemHandle;
          type: 'file' | 'folder';
          path: string[];
        }> = [];
        const dirHandle = row.item.handle as FileSystemDirectoryHandle;
        for await (const [name, handle] of dirHandle.entries()) {
          entries.push({
            name,
            kind: handle.kind,
            handle,
            type: handle.kind === 'directory' ? 'folder' : 'file',
            path: [...row.path, name],
          });
        }
        if (
          !isCurrentWorkspace(workspace) ||
          workspace.rootHandle !== rootHandle ||
          workspace.mode !== 'local' ||
          folderLoadRequestRef.current.get(row.pathStr) !== requestId
        ) {
          return;
        }
        sidebarState((draft) => {
          const currentNode = findNodeAtPath(draft.folderTree || [], row.path);
          const stagedPaths = new Set([
            ...Object.keys(editorState.pendingDiffs || {}),
            ...Object.keys(editorState.pendingDeletions || {}),
            ...Object.keys(editorState.dirtyBufferContents || {}),
          ]);
          const preservesStagedPath = (node: TreeNode, path: string[]): boolean => {
            if (stagedPaths.has(path.join('/'))) return true;
            return Boolean(
              node.children?.some((child) =>
                preservesStagedPath(child, child.path || [...path, child.name]),
              ),
            );
          };
          const nextChildren = mergeFileSystemTree(
            normalizeChildren(entries, row.path),
            currentNode?.children || [],
            preservesStagedPath,
            row.path,
          );
          draft.folderTree = setChildrenAtPath(draft.folderTree, row.path, nextChildren, true);
          const nextExpanded = { ...(draft.expandedFolders || {}) };
          for (const child of entries) {
            const childPath = [...row.path, child.name];
            if (child.kind === 'directory' && isNodeModulesPath(childPath)) {
              nextExpanded[getPathStr(childPath)] = false;
            }
          }
          draft.expandedFolders = nextExpanded;
        });
      } catch (err) {
        console.error('Failed to load directory:', err);
      } finally {
        if (folderLoadRequestRef.current.get(row.pathStr) === requestId) {
          folderLoadRequestRef.current.delete(row.pathStr);
          setLoadingPaths((current: Record<string, boolean>) => {
            const next = { ...current };
            delete next[row.pathStr];
            return next;
          });
        }
      }
    },
    [
      captureWorkspace,
      editorState,
      fs.mode,
      fs.rootHandle,
      isCurrentWorkspace,
      sidebarState,
      setLoadingPaths,
    ],
  );

  const handleToggle = useCallback(
    (row: SidebarRow, options: ToggleOptions = {}) => {
      if (row.item.isRoot) return;
      if (row.item.type !== 'folder') return;
      const isCurrentlyExpanded = !!row.item.children && expandedFolders[row.pathStr] !== false;
      sidebarState((draft) => {
        draft.expandedFolders = {
          ...draft.expandedFolders,
          [row.pathStr]: options.expandOnly ? true : !isCurrentlyExpanded,
        };
      });
      if (!row.item.children || !isCurrentlyExpanded || options.expandOnly) {
        loadChildren(row, fs.mode === 'local');
      }
    },
    [expandedFolders, fs.mode, loadChildren, sidebarState],
  );

  return { loadChildren, handleToggle };
}
