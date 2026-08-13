import { createState } from '@/components/state/State';
import type { TreeItemStateShape } from '@/types/domain-types';
import { useLongPress } from '@/utils/touch';
import { type TouchEvent as ReactTouchEvent, useEffect, useRef } from 'react';
import { requireStore } from '../../types';
import type { UseTreeItemControlsParams } from './sidebar-types';

export const TreeItemState = createState<TreeItemStateShape>('TreeItemState');

export function useTreeItemControls({
  row,
  onOpenFile,
  onRename,
  onStartCreate,
}: UseTreeItemControlsParams) {
  const { item } = row;
  const treeItemState = requireStore(
    TreeItemState.useState(null, {
      isEditing: false,
      editValue: item.name,
      contextMenu: null,
      showDeleteDialog: false,
    }),
  );
  const {
    isEditing = false,
    editValue = item.name,
    contextMenu = null,
    showDeleteDialog = false,
  } = treeItemState || {};
  const editInputRef = useRef<HTMLInputElement | null>(null);

  const closeContextMenu = () => {
    treeItemState((draft) => {
      draft.contextMenu = null;
    });
  };

  const longPressHandlers = useLongPress(
    (event: ReactTouchEvent) => {
      const touch = event.touches[0];
      treeItemState((draft) => {
        draft.contextMenu = { x: touch.pageX, y: touch.pageY };
      });
    },
    { disabled: isEditing },
  );

  useEffect(() => {
    treeItemState((draft) => {
      draft.editValue = item.name;
    });
  }, [item.name, treeItemState]);

  useEffect(() => {
    if (isEditing) editInputRef.current?.focus();
  }, [isEditing]);

  useEffect(() => {
    const handleWindowClick = () => {
      treeItemState((draft) => {
        draft.contextMenu = null;
      });
    };
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, [treeItemState]);

  const submitRename = async () => {
    const nextName = editValue.trim();
    if (nextName && nextName !== item.name) {
      const renamed = await onRename(row, nextName);
      if (!renamed) return;
    }
    treeItemState((draft) => {
      draft.isEditing = false;
    });
  };

  return {
    closeContextMenu,
    contextMenu,
    editInputRef,
    editValue,
    handleContextMenu: (event: React.MouseEvent) => {
      if (isEditing) return;
      event.preventDefault();
      treeItemState((draft) => {
        draft.contextMenu = { x: event.pageX, y: event.pageY };
      });
    },
    isEditing,
    longPressHandlers,
    openWith: (viewType: string) => {
      onOpenFile(row, { viewType });
      closeContextMenu();
    },
    setEditValue: (value: string) => {
      treeItemState((draft) => {
        draft.editValue = value;
      });
    },
    startCreate: (type: string) => {
      closeContextMenu();
      onStartCreate(row, type);
    },
    startDelete: () => {
      treeItemState((draft) => {
        draft.showDeleteDialog = true;
        draft.contextMenu = null;
      });
    },
    startRename: () => {
      treeItemState((draft) => {
        draft.isEditing = true;
        draft.contextMenu = null;
      });
    },
    stopEditing: () => {
      treeItemState((draft) => {
        draft.isEditing = false;
      });
    },
    submitRename,
    showDeleteDialog,
    setShowDeleteDialog: (isOpen: boolean) => {
      treeItemState((draft) => {
        draft.showDeleteDialog = isOpen;
      });
    },
  };
}
