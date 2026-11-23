import type { SidebarFileLoaderParams } from '@/components/App/types';
import { useCallback, useRef } from 'react';
import { type WorkspaceSnapshot, useSidebarDirectoryLoader } from './useSidebarDirectoryLoader';
import { useSidebarFileOpener } from './useSidebarFileOpener';
import { useSidebarTreeMutations } from './useSidebarTreeMutations';

export default function useSidebarFileLoader({
  fs,
  appState,
  sidebarState,
  tabState,
  editorState,
  changeSetState,
  setLoadingPaths,
  addNotification,
}: SidebarFileLoaderParams) {
  const rootHandleRef = useRef(fs.rootHandle);
  const fsModeRef = useRef(fs.mode);
  const workspaceEpochRef = useRef(appState.workspaceEpoch || 0);
  rootHandleRef.current = fs.rootHandle;
  fsModeRef.current = fs.mode;
  workspaceEpochRef.current = appState.workspaceEpoch || 0;

  const captureWorkspace = useCallback(
    (): WorkspaceSnapshot => ({
      rootHandle: rootHandleRef.current,
      mode: fsModeRef.current,
      epoch: workspaceEpochRef.current,
    }),
    [],
  );
  const isCurrentWorkspace = useCallback(
    (token: WorkspaceSnapshot) =>
      token.rootHandle === rootHandleRef.current &&
      token.mode === fsModeRef.current &&
      token.epoch === workspaceEpochRef.current,
    [],
  );

  const { loadChildren, handleToggle } = useSidebarDirectoryLoader({
    fs,
    sidebarState,
    editorState,
    setLoadingPaths,
    captureWorkspace,
    isCurrentWorkspace,
  });

  const { handleOpenFile } = useSidebarFileOpener({
    fs,
    appState,
    sidebarState,
    tabState,
    editorState,
    addNotification,
    captureWorkspace,
    isCurrentWorkspace,
  });

  const { handleRename, handleCreate, handleDelete } = useSidebarTreeMutations({
    fs,
    appState,
    sidebarState,
    tabState,
    editorState,
    changeSetState,
    addNotification,
    captureWorkspace,
    isCurrentWorkspace,
    loadChildren,
  });

  return {
    loadChildren,
    handleToggle,
    handleOpenFile,
    handleRename,
    handleCreate,
    handleDelete,
  };
}
