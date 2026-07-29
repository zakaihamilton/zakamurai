import { useCallback } from 'react';

export default function useTabDragAndDrop({
  tabState,
  tabBarUiState,
  draggedTabId,
  resetDragState,
}) {
  const handleDragStart = useCallback(
    (e, tabId) => {
      e.dataTransfer.setData('tabId', tabId);
      e.dataTransfer.effectAllowed = 'move';
      tabBarUiState((draft) => {
        draft.draggedTabId = tabId;
      });
    },
    [tabBarUiState],
  );

  const handleDragOver = useCallback(
    (e, tabId) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      tabBarUiState((draft) => {
        draft.isOverBar = false;
        if (tabId !== draggedTabId) {
          draft.dropTargetId = tabId;
        }
      });
    },
    [tabBarUiState, draggedTabId],
  );

  const handleDragEnd = useCallback(() => {
    resetDragState();
  }, [resetDragState]);

  const handleDrop = useCallback(
    (e, targetTabId) => {
      e.preventDefault();
      e.stopPropagation();
      const draggedId = e.dataTransfer.getData('tabId');
      if (!draggedId || draggedId === targetTabId) {
        resetDragState();
        return;
      }

      tabState((draft) => {
        const openTabs = [...(draft.openTabs || [])];
        const draggedIndex = openTabs.findIndex((t) => t.id === draggedId);
        const targetIndex = openTabs.findIndex((t) => t.id === targetTabId);

        if (draggedIndex !== -1 && targetIndex !== -1) {
          const [draggedTab] = openTabs.splice(draggedIndex, 1);
          openTabs.splice(targetIndex, 0, draggedTab);
          draft.openTabs = openTabs;
        }
      });

      resetDragState();
    },
    [tabState, resetDragState],
  );

  const handleDropOnBar = useCallback(
    (e) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData('tabId');
      if (!draggedId) return;

      tabState((draft) => {
        const openTabs = [...(draft.openTabs || [])];
        const draggedIndex = openTabs.findIndex((t) => t.id === draggedId);
        if (draggedIndex !== -1) {
          const [draggedTab] = openTabs.splice(draggedIndex, 1);
          openTabs.push(draggedTab);
          draft.openTabs = openTabs;
        }
      });

      resetDragState();
    },
    [tabState, resetDragState],
  );

  return { handleDragStart, handleDragOver, handleDragEnd, handleDrop, handleDropOnBar };
}
