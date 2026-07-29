import type { FlatTreeRow } from '@/components/App/types';
import type { SidebarStateShape } from '@/components/state/domain-types';
import type { Draft } from '@/components/state/types';
import { useCallback } from 'react';
import type { UseSidebarDragAndDropParams } from './sidebar-types';
import { getPathStr } from './TreeUtils';

export default function useSidebarDragAndDrop({
  fs,
  sidebarState,
  setDropTargetPath,
}: UseSidebarDragAndDropParams) {
  const handleDragStart = useCallback(
    (event: React.DragEvent, row: FlatTreeRow) => {
      if (row.item.isRoot) {
        event.preventDefault();
        return;
      }
      sidebarState((draft: Draft<SidebarStateShape>) => {
        draft.draggedItem = {
          path: row.path,
          type: row.item.type,
          handle: row.item.handle ?? undefined,
          name: row.item.name,
        };
      });
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', row.pathStr);
    },
    [sidebarState],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent, row: FlatTreeRow) => {
      const draggedItem = sidebarState.draggedItem;
      if (!draggedItem?.path || row.item.type !== 'folder') return;
      const sourcePath = getPathStr(draggedItem.path);
      const invalid = sourcePath === row.pathStr || row.pathStr.startsWith(`${sourcePath}/`);
      if (!invalid) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }
    },
    [sidebarState.draggedItem],
  );

  const handleDragEnter = useCallback(
    (_event: React.DragEvent, row: FlatTreeRow) => {
      const draggedItem = sidebarState.draggedItem;
      if (!draggedItem?.path || row.item.type !== 'folder') return;
      const sourcePath = getPathStr(draggedItem.path);
      if (sourcePath !== row.pathStr && !row.pathStr.startsWith(`${sourcePath}/`)) {
        setDropTargetPath(row.pathStr);
      }
    },
    [sidebarState.draggedItem, setDropTargetPath],
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent, row: FlatTreeRow) => {
      event.preventDefault();
      setDropTargetPath(null);
      const draggedItem = sidebarState.draggedItem;
      if (!draggedItem?.path || !draggedItem.name || row.item.type !== 'folder') return;
      const sourcePathStr = getPathStr(draggedItem.path);
      const nextPathStr = getPathStr([...row.path, draggedItem.name]);
      if (sourcePathStr === row.pathStr || row.pathStr.startsWith(`${sourcePathStr}/`)) return;

      if (
        fs.mode === 'local' &&
        draggedItem.handle &&
        row.item.handle &&
        row.item.handle.kind === 'directory'
      ) {
        await fs.moveEntry(draggedItem.handle, row.item.handle);
      }

      sidebarState((draft: Draft<SidebarStateShape>) => {
        draft.draggedItem = null;
        const nextExpanded: Record<string, boolean> = {};
        for (const key in draft.expandedFolders) {
          nextExpanded[
            key === sourcePathStr || key.startsWith(`${sourcePathStr}/`)
              ? nextPathStr + key.substring(sourcePathStr.length)
              : key
          ] = draft.expandedFolders[key];
        }
        draft.expandedFolders = nextExpanded;
      });
    },
    [fs, sidebarState, setDropTargetPath],
  );

  return {
    handleDragStart,
    handleDragOver,
    handleDragEnter,
    handleDrop,
  };
}
