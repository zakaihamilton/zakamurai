import type { FileSystemApi, FlatTreeRow, NormalizedTreeNode } from '@/components/App/types';
import type {
  SidebarStateShape,
  SidebarUiStateShape,
  TabStateShape,
  TreeNode,
} from '@/types/domain-types';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import type { StateStore } from 'triactor';
import {
  flattenTree,
  insertCreateRow,
  isNodeModulesPath,
  mergeFileSystemTree,
  normalizeChildren,
} from './TreeUtils';
import type { SidebarTreeRow } from './sidebar-types';

type SidebarDataParams = {
  fs: FileSystemApi;
  sidebarState: StateStore<SidebarStateShape>;
  editorState: {
    pendingDiffs?: Record<string, unknown>;
    pendingDeletions?: Record<string, unknown>;
    dirtyBufferContents?: Record<string, string>;
  };
  sidebarUiState: StateStore<SidebarUiStateShape>;
  tabState: StateStore<TabStateShape>;
  projectName: string;
  folderTree: TreeNode[];
  expandedFolders: Record<string, boolean>;
  deferredFilterText: string;
  creatingAt: SidebarUiStateShape['creatingAt'];
  loadChildren: (row: FlatTreeRow, force?: boolean) => Promise<void>;
  handleToggle: (row: FlatTreeRow, options?: { expandOnly?: boolean }) => void;
};

type SidebarDataResult = {
  searchInputRef: RefObject<HTMLInputElement | null>;
  rows: SidebarTreeRow[];
  scrollToIndex: number | null;
  handleStartCreate: (row: SidebarTreeRow, type: string) => void;
  handleCancelCreate: () => void;
};

export default function useSidebarData({
  fs,
  sidebarState,
  editorState,
  sidebarUiState,
  tabState,
  projectName,
  folderTree,
  expandedFolders,
  deferredFilterText,
  creatingAt,
  loadChildren,
  handleToggle,
}: SidebarDataParams): SidebarDataResult {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const loadingIncompleteFoldersRef = useRef(new Map<string, symbol>());
  const lastRootHandleRef = useRef(fs.rootHandle);
  const refreshedFilesystemVersionRef = useRef<number | null>(null);
  const syncedFsRef = useRef<{
    files: TreeNode[] | null;
    mode: string | null;
    version: number | null;
  }>({ files: null, mode: null, version: null });

  useEffect(() => {
    if (!fs.mode) return;

    const previous = syncedFsRef.current;
    if (
      previous.files === fs.files &&
      previous.mode === fs.mode &&
      previous.version === fs.version
    ) {
      return;
    }

    syncedFsRef.current = { files: fs.files, mode: fs.mode, version: fs.version };
    const nextTree = normalizeChildren(fs.files || []);
    const stagedPaths = new Set([
      ...Object.keys(editorState.pendingDiffs || {}),
      ...Object.keys(editorState.pendingDeletions || {}),
      ...Object.keys(editorState.dirtyBufferContents || {}),
    ]);
    const stagedPathsAndAncestors = new Set<string>();
    for (const stagedPath of stagedPaths) {
      const segments = stagedPath.split('/').filter(Boolean);
      for (let index = 1; index <= segments.length; index++) {
        stagedPathsAndAncestors.add(segments.slice(0, index).join('/'));
      }
    }
    const preservesStagedPath = (_node: TreeNode, path: string[]): boolean =>
      stagedPathsAndAncestors.has(path.join('/'));
    sidebarState((draft) => {
      draft.folderTree = mergeFileSystemTree(nextTree, draft.folderTree || [], preservesStagedPath);
      const nextExpanded = { ...(draft.expandedFolders || {}) };
      for (const row of flattenTree(draft.folderTree, {}, '', [], 0)) {
        if (row.item.type === 'folder' && isNodeModulesPath(row.path)) {
          nextExpanded[row.pathStr] = false;
        }
      }
      draft.expandedFolders = nextExpanded;
    });
  }, [editorState, fs.files, fs.mode, fs.version, sidebarState]);

  useEffect(() => {
    if (fs.mode !== 'local') return;
    if (lastRootHandleRef.current !== fs.rootHandle) {
      lastRootHandleRef.current = fs.rootHandle;
      loadingIncompleteFoldersRef.current.clear();
    }
    const filesystemVersionChanged = refreshedFilesystemVersionRef.current !== fs.version;
    refreshedFilesystemVersionRef.current = fs.version;
    const incompleteExpandedFolders = flattenTree(folderTree, expandedFolders, '').filter(
      (row) =>
        row.item.type === 'folder' &&
        (filesystemVersionChanged || row.item.childrenLoaded === false) &&
        expandedFolders[row.pathStr] === true &&
        Boolean(row.item.handle),
    );
    for (const row of incompleteExpandedFolders) {
      if (loadingIncompleteFoldersRef.current.has(row.pathStr)) continue;
      const requestToken = Symbol(row.pathStr);
      loadingIncompleteFoldersRef.current.set(row.pathStr, requestToken);
      void loadChildren(row, true).finally(() => {
        if (loadingIncompleteFoldersRef.current.get(row.pathStr) === requestToken) {
          loadingIncompleteFoldersRef.current.delete(row.pathStr);
        }
      });
    }
  }, [expandedFolders, folderTree, fs.mode, fs.rootHandle, fs.version, loadChildren]);

  useEffect(() => {
    const handleFocusSearch = () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener('focus-file-search', handleFocusSearch);
    return () => window.removeEventListener('focus-file-search', handleFocusSearch);
  }, []);

  useEffect(() => {
    if (!tabState.activeTabId) return;

    const activeTab = tabState.openTabs?.find((tab) => tab.id === tabState.activeTabId);
    if (!activeTab || activeTab.type !== 'file') return;

    const segments = tabState.activeTabId.split('/');
    if (segments.length <= 1) return;

    let cancelled = false;
    const expandPath = async () => {
      let currentTree = folderTree;
      const currentPath: string[] = [];

      for (let index = 0; index < segments.length - 1; index++) {
        if (cancelled) return;
        const segment = segments[index];
        currentPath.push(segment);
        const pathStr = currentPath.join('/');
        const node = currentTree.find((item) => item.name === segment && item.type === 'folder');
        if (!node) break;

        if (expandedFolders[pathStr] === false || !expandedFolders[pathStr]) {
          sidebarState((draft) => {
            draft.expandedFolders = {
              ...draft.expandedFolders,
              [pathStr]: true,
            };
          });
        }

        if (!node.children) {
          if (fs.mode === 'local') {
            await loadChildren({
              item: node as NormalizedTreeNode,
              path: [...currentPath],
              pathStr,
              level: currentPath.length,
            });
          }
          break;
        }
        currentTree = node.children;
      }
    };

    void expandPath();
    return () => {
      cancelled = true;
    };
  }, [
    tabState.activeTabId,
    tabState.openTabs,
    folderTree,
    expandedFolders,
    fs.mode,
    sidebarState,
    loadChildren,
  ]);

  const baseRows = useMemo(
    () => [
      {
        key: '__root__',
        item: { name: projectName, type: 'folder', path: [], isRoot: true, handle: fs.rootHandle },
        level: 0,
        path: [],
        pathStr: '',
      },
      ...flattenTree(folderTree, expandedFolders, deferredFilterText),
    ],
    [deferredFilterText, expandedFolders, folderTree, fs.rootHandle, projectName],
  );

  const rows = useMemo(
    () => insertCreateRow(baseRows as Parameters<typeof insertCreateRow>[0], creatingAt),
    [baseRows, creatingAt],
  );

  const activeIndex = useMemo(() => {
    if (!tabState.activeTabId) return -1;
    return rows.findIndex((row) => !row.isCreateRow && row.pathStr === tabState.activeTabId);
  }, [rows, tabState.activeTabId]);

  const scrollToIndex = useMemo(() => {
    if (creatingAt) {
      const createIndex = rows.findIndex((row) => row.isCreateRow);
      if (createIndex >= 0) return createIndex;
    }
    return activeIndex >= 0 ? activeIndex : null;
  }, [creatingAt, rows, activeIndex]);

  const handleStartCreate = useCallback(
    (row: SidebarTreeRow, type: string) => {
      sidebarUiState((draft) => {
        draft.creatingAt = { pathStr: row.pathStr, type };
      });
      const isExpanded = row.item.isRoot || expandedFolders[row.pathStr] !== false;
      if (row.item.type === 'folder' && !isExpanded) {
        handleToggle(row, { expandOnly: true });
      }
    },
    [expandedFolders, handleToggle, sidebarUiState],
  );

  const handleCancelCreate = useCallback(() => {
    sidebarUiState((draft) => {
      draft.creatingAt = null;
    });
  }, [sidebarUiState]);

  return { searchInputRef, rows, scrollToIndex, handleStartCreate, handleCancelCreate };
}
