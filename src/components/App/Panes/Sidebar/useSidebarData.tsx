import type { FileSystemApi, FlatTreeRow, NormalizedTreeNode } from '@/components/App/types';
import type { StateStore } from '@/components/state/types';
import type {
  SidebarStateShape,
  SidebarUiStateShape,
  TabStateShape,
  TreeNode,
} from '@/types/domain-types';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { flattenTree, insertCreateRow, isNodeModulesPath, normalizeChildren } from './TreeUtils';
import type { SidebarTreeRow } from './sidebar-types';

type SidebarDataParams = {
  fs: FileSystemApi;
  sidebarState: StateStore<SidebarStateShape>;
  sidebarUiState: StateStore<SidebarUiStateShape>;
  tabState: StateStore<TabStateShape>;
  projectName: string;
  folderTree: TreeNode[];
  expandedFolders: Record<string, boolean>;
  deferredFilterText: string;
  creatingAt: SidebarUiStateShape['creatingAt'];
  loadChildren: (row: FlatTreeRow) => Promise<void>;
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
    sidebarState((draft) => {
      draft.folderTree = nextTree;
      const nextExpanded = { ...(draft.expandedFolders || {}) };
      for (const row of flattenTree(nextTree, {}, '', [], 0)) {
        if (row.item.type === 'folder' && isNodeModulesPath(row.path)) {
          nextExpanded[row.pathStr] = false;
        }
      }
      draft.expandedFolders = nextExpanded;
    });
  }, [fs.files, fs.mode, fs.version, sidebarState]);

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
