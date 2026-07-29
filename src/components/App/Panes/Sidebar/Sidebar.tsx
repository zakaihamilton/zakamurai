import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import type { NormalizedTreeNode } from '@/components/App/types';
import { useFileSystem } from '@/components/Storage';
import { createState } from '@/components/state/State';
import type {
  SidebarStateShape,
  SidebarUiStateShape,
  TreeNode,
} from '@/components/state/domain-types';
import { useNotification } from '@/components/ui/Notification';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react';
import type { ChangeEvent, SetStateAction } from 'react';
import { requireStore } from '../../types';
import SidebarFilter from './Filter';
import SidebarMountSection from './MountSection';
import SidebarContent from './SidebarContent';
import useSidebarDragAndDrop from './SidebarDragAndDrop';
import useSidebarFileLoader from './SidebarFileLoader';
import SidebarTree from './Tree';
import { flattenTree, insertCreateRow, isNodeModulesPath, normalizeChildren } from './TreeUtils';
import WorkspaceHealth from './WorkspaceHealth';
import type { SidebarTreeProps, SidebarTreeRow, SidebarUiKey } from './sidebar-types';
import useSidebarLayout from './useSidebarLayout';

export const SidebarState = createState<SidebarStateShape>('SidebarState');
export const SidebarUiState = createState<SidebarUiStateShape>('SidebarUiState');

export default function Sidebar() {
  const sidebarState = requireStore(
    SidebarState.useState([
      'isSidebarOpen',
      'isSidebarPopupOpen',
      'folderTree',
      'sidebarWidth',
      'expandedFolders',
      'draggedItem',
    ]),
  );
  const { isSidebarOpen, folderTree = [], sidebarWidth, expandedFolders = {} } = sidebarState;
  const { projectName, isMobile } = requireStore(AppState.useState(['projectName', 'isMobile']));
  const appState = AppState.usePassiveState();
  const fs = useFileSystem();
  const tabState = requireStore(TabState.useState(['activeTabId', 'openTabs']));
  const editorState = EditorState.usePassiveState();
  const sidebarUiState = requireStore(
    SidebarUiState.useState(null, {
      filterText: '',
      loadingPaths: {},
      dropTargetPath: null,
      animatedWidth: sidebarWidth ?? 0,
      creatingAt: null,
    }),
  );
  const {
    filterText = '',
    loadingPaths = {},
    dropTargetPath = null,
    animatedWidth = sidebarWidth ?? 0,
    creatingAt = null,
  } = sidebarUiState || {};
  const setSidebarUiValue = useCallback(
    <K extends SidebarUiKey>(
      key: K,
      nextValue:
        | SidebarUiStateShape[K]
        | ((current: SidebarUiStateShape[K]) => SidebarUiStateShape[K]),
    ) => {
      sidebarUiState((draft) => {
        draft[key] =
          typeof nextValue === 'function'
            ? (nextValue as (current: SidebarUiStateShape[K]) => SidebarUiStateShape[K])(draft[key])
            : nextValue;
      });
    },
    [sidebarUiState],
  );
  const setLoadingPaths = useCallback(
    (nextValue: SetStateAction<Record<string, boolean>>) =>
      setSidebarUiValue('loadingPaths', nextValue as SidebarUiStateShape['loadingPaths']),
    [setSidebarUiValue],
  );
  const setDropTargetPath = useCallback(
    (nextValue: SetStateAction<string | null>) =>
      setSidebarUiValue('dropTargetPath', nextValue as SidebarUiStateShape['dropTargetPath']),
    [setSidebarUiValue],
  );
  const setAnimatedWidth = useCallback(
    (nextValue: SetStateAction<number>) =>
      setSidebarUiValue('animatedWidth', nextValue as SidebarUiStateShape['animatedWidth']),
    [setSidebarUiValue],
  );
  const deferredFilterText = useDeferredValue(filterText);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const syncedFsRef = useRef<{
    files: TreeNode[] | null;
    mode: string | null;
    version: number | null;
  }>({ files: null, mode: null, version: null });
  const { addNotification } = useNotification();

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

  const { loadChildren, handleToggle, handleOpenFile, handleRename, handleCreate, handleDelete } =
    useSidebarFileLoader({
      fs,
      appState: requireStore(appState),
      sidebarState,
      tabState,
      editorState: requireStore(editorState),
      setLoadingPaths,
      addNotification,
    });

  // Auto-expand and load parent folders for active tab
  useEffect(() => {
    if (!tabState.activeTabId) return;

    const activeTab = tabState.openTabs?.find((t) => t.id === tabState.activeTabId);
    if (!activeTab || activeTab.type !== 'file') return;

    const segments = tabState.activeTabId.split('/');
    if (segments.length <= 1) return;

    let cancelled = false;

    const expandPath = async () => {
      let currentTree = folderTree;
      const currentPath = [];

      for (let i = 0; i < segments.length - 1; i++) {
        if (cancelled) return;
        const segment = segments[i];
        currentPath.push(segment);
        const pathStr = currentPath.join('/');

        // Find the node in the current tree level
        const node = currentTree.find((n) => n.name === segment && n.type === 'folder');
        if (!node) {
          // Node not found yet, maybe folderTree hasn't updated or children are still loading
          break;
        }

        // If not expanded, expand it
        if (expandedFolders[pathStr] === false || !expandedFolders[pathStr]) {
          sidebarState((draft) => {
            draft.expandedFolders = {
              ...draft.expandedFolders,
              [pathStr]: true,
            };
          });
        }

        // If children are not loaded yet and we are in local mode, load them
        if (!node.children) {
          if (fs.mode === 'local') {
            const row = {
              item: node as NormalizedTreeNode,
              path: [...currentPath],
              pathStr,
              level: currentPath.length,
            };
            await loadChildren(row);
          }
          // Break to let the next render run with the updated tree
          break;
        }

        currentTree = node.children;
      }
    };

    expandPath();

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

  const { handleDragStart, handleDragOver, handleDragEnter, handleDrop } = useSidebarDragAndDrop({
    fs,
    sidebarState,
    setDropTargetPath,
  });

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

  const isOpen = isMobile ? sidebarState.isSidebarPopupOpen : isSidebarOpen;
  const { desktopWidth } = useSidebarLayout({
    isMobile,
    isOpen,
    sidebarWidth,
    animatedWidth,
    setAnimatedWidth,
  });

  return (
    <SidebarContent isMobile={isMobile} isOpen={isOpen} desktopWidth={desktopWidth}>
      <SidebarMountSection hasFileSystem={Boolean(fs.mode)} onMountLocal={fs.mountLocal} />
      <SidebarFilter
        inputRef={searchInputRef}
        value={filterText}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          sidebarUiState((draft) => {
            draft.filterText = event.target.value;
          })
        }
      />
      <WorkspaceHealth />
      <SidebarTree
        rows={rows}
        activeTabId={tabState.activeTabId}
        scrollToIndex={scrollToIndex ?? undefined}
        filterText={deferredFilterText}
        expandedFolders={expandedFolders}
        loadingPaths={loadingPaths}
        draggedPath={sidebarState.draggedItem?.path?.join('/') ?? null}
        dropTargetPath={dropTargetPath}
        isOpen={isOpen}
        hasFileSystem={Boolean(fs.mode)}
        onToggle={handleToggle as SidebarTreeProps['onToggle']}
        onOpenFile={handleOpenFile as SidebarTreeProps['onOpenFile']}
        onRename={handleRename as unknown as SidebarTreeProps['onRename']}
        onCreate={handleCreate as unknown as SidebarTreeProps['onCreate']}
        onStartCreate={handleStartCreate as SidebarTreeProps['onStartCreate']}
        onCancelCreate={handleCancelCreate}
        onDelete={handleDelete}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={() => setDropTargetPath(null)}
        onDrop={handleDrop}
        onDragEnd={() => {
          setDropTargetPath(null);
          sidebarState((draft) => {
            draft.draggedItem = null;
          });
        }}
      />
    </SidebarContent>
  );
}
