import type { TreeItemStateShape } from '@/components/state/domain-types';
import { createState } from '@/components/state/State';
import { useLongPress } from '@/utils/touch';
import { useEffect, useRef } from 'react';
import { requireStore } from '../../types';

export const TreeItemState = createState<TreeItemStateShape>('TreeItemState');

export function useTreeItemControls({ row, onOpenFile, onRename, onStartCreate }) {
  const { item } = row;
  const treeItemState = requireStore(TreeItemState.useState(null, {
    isEditing: false,
    editValue: item.name,
    contextMenu: null,
    showDeleteDialog: false,
  }));
  const {
    isEditing = false,
    editValue = item.name,
    contextMenu = null,
    showDeleteDialog = false,
  } = treeItemState || {};
  const editInputRef = useRef(null);

  const closeContextMenu = () => {
    treeItemState((draft) => {
      draft.contextMenu = null;
    });
  };

  const longPressHandlers = useLongPress(
    (event) => {
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
    handleContextMenu: (event) => {
      if (isEditing) return;
      event.preventDefault();
      treeItemState((draft) => {
        draft.contextMenu = { x: event.pageX, y: event.pageY };
      });
    },
    isEditing,
    longPressHandlers,
    openWith: (viewType) => {
      onOpenFile(row, { viewType });
      closeContextMenu();
    },
    setEditValue: (value) => {
      treeItemState((draft) => {
        draft.editValue = value;
      });
    },
    startCreate: (type) => {
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
    setShowDeleteDialog: (isOpen) => {
      treeItemState((draft) => {
        draft.showDeleteDialog = isOpen;
      });
    },
  };
}
