import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { useFileSystem } from '@/components/Storage';
import { createState } from '@/components/state/State';
import type { SidebarStateShape, SidebarUiStateShape } from '@/components/state/domain-types';
import { useNotification } from '@/components/ui/Notification';
import { useCallback, useDeferredValue } from 'react';
import type { ChangeEvent, SetStateAction } from 'react';
import { requireStore } from '../../types';
import SidebarFilter from './Filter';
import SidebarMountSection from './MountSection';
import SidebarContent from './SidebarContent';
import useSidebarDragAndDrop from './SidebarDragAndDrop';
import useSidebarFileLoader from './SidebarFileLoader';
import SidebarTree from './Tree';
import WorkspaceHealth from './WorkspaceHealth';
import type { SidebarTreeProps, SidebarUiKey } from './sidebar-types';
import useSidebarData from './useSidebarData';
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
  const { addNotification } = useNotification();

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

  const { handleDragStart, handleDragOver, handleDragEnter, handleDrop } = useSidebarDragAndDrop({
    fs,
    sidebarState,
    setDropTargetPath,
  });

  const { searchInputRef, rows, scrollToIndex, handleStartCreate, handleCancelCreate } =
    useSidebarData({
      fs,
      sidebarState,
      sidebarUiState,
      tabState,
      projectName,
      folderTree,
      expandedFolders,
      deferredFilterText,
      creatingAt,
      loadChildren: loadChildren as (
        row: import('@/components/App/types').FlatTreeRow,
      ) => Promise<void>,
      handleToggle: handleToggle as (
        row: import('@/components/App/types').FlatTreeRow,
        options?: { expandOnly?: boolean },
      ) => void,
    });

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
