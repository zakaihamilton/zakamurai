import { useCallback } from 'react';
import { getPathStr } from './TreeUtils';

export default function useSidebarDragAndDrop({ fs, sidebarState, setDropTargetPath }) {
  const handleDragStart = useCallback(
    (event, row) => {
      if (row.item.isRoot) {
        event.preventDefault();
        return;
      }
      sidebarState((draft) => {
        draft.draggedItem = {
          path: row.path,
          type: row.item.type,
          handle: row.item.handle,
          name: row.item.name,
        };
      });
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', row.pathStr);
    },
    [sidebarState],
  );

  const handleDragOver = useCallback(
    (event, row) => {
      const draggedItem = sidebarState.draggedItem;
      if (!draggedItem || row.item.type !== 'folder') return;
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
    (_event, row) => {
      const draggedItem = sidebarState.draggedItem;
      if (!draggedItem || row.item.type !== 'folder') return;
      const sourcePath = getPathStr(draggedItem.path);
      if (sourcePath !== row.pathStr && !row.pathStr.startsWith(`${sourcePath}/`)) {
        setDropTargetPath(row.pathStr);
      }
    },
    [sidebarState.draggedItem, setDropTargetPath],
  );

  const handleDrop = useCallback(
    async (event, row) => {
      event.preventDefault();
      setDropTargetPath(null);
      const draggedItem = sidebarState.draggedItem;
      if (!draggedItem || row.item.type !== 'folder') return;
      const sourcePathStr = getPathStr(draggedItem.path);
      const nextPathStr = getPathStr([...row.path, draggedItem.name]);
      if (sourcePathStr === row.pathStr || row.pathStr.startsWith(`${sourcePathStr}/`)) return;

      if (fs.mode === 'local' && draggedItem.handle && row.item.handle) {
        await fs.moveEntry(draggedItem.handle, row.item.handle);
      }

      sidebarState((draft) => {
        draft.draggedItem = null;
        const nextExpanded = {};
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
