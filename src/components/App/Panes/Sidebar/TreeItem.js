import Node from '@/components/state/Node';
import { createState } from '@/components/state/State';
import Dialog from '@/components/ui/Dialog';
import dialogStyles from '@/components/ui/Dialog/Dialog.module.css';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { isMediaFile } from '@/utils/file';
import { useLongPress } from '@/utils/touch';
import React, { useEffect, useRef } from 'react';
import SidebarContextMenu from './SidebarContextMenu';
import styles from './TreeItem.module.css';

const TreeItemState = createState('TreeItemState');

const getNameHighlightRanges = (name, pathStr, filterText) => {
  const query = filterText.trim().toLowerCase();
  if (!query) return [];

  const matchIndex = pathStr.toLowerCase().indexOf(query);
  if (matchIndex === -1) return [];

  const nameStart = Math.max(0, pathStr.length - name.length);
  const start = Math.max(0, matchIndex - nameStart);
  const end = Math.min(name.length, matchIndex + query.length - nameStart);
  return start < end ? [{ start, end }] : [];
};

const renderHighlightedName = (name, pathStr, filterText) => {
  const ranges = getNameHighlightRanges(name, pathStr, filterText);
  if (ranges.length === 0) return name;

  const parts = [];
  let cursor = 0;
  for (const range of ranges) {
    if (cursor < range.start) {
      parts.push(name.slice(cursor, range.start));
    }
    parts.push(
      <mark key={`${range.start}-${range.end}`} className={styles.nameMatch}>
        {name.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  if (cursor < name.length) {
    parts.push(name.slice(cursor));
  }
  return parts;
};

export default function TreeItem({
  row,
  filterText = '',
  isActive,
  isExpanded,
  isLoading,
  isDragged,
  isDropTarget,
  onToggle,
  onOpenFile,
  onRename,
  onCreate,
  onDelete,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
}) {
  return (
    <Node id={row?.pathStr || row?.item?.name || 'TreeItem'}>
      <TreeItemInner
        row={row}
        filterText={filterText}
        isActive={isActive}
        isExpanded={isExpanded}
        isLoading={isLoading}
        isDragged={isDragged}
        isDropTarget={isDropTarget}
        onToggle={onToggle}
        onOpenFile={onOpenFile}
        onRename={onRename}
        onCreate={onCreate}
        onDelete={onDelete}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
      />
    </Node>
  );
}

function TreeItemInner({
  row,
  filterText = '',
  isActive,
  isExpanded,
  isLoading,
  isDragged,
  isDropTarget,
  onToggle,
  onOpenFile,
  onRename,
  onCreate,
  onDelete,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
}) {
  const { item, level, pathStr } = row;
  const treeItemState = TreeItemState.useState(null, {
    isEditing: false,
    editValue: item.name,
    isCreating: null,
    createValue: '',
    contextMenu: null,
    showDeleteDialog: false,
  });
  const {
    isEditing = false,
    editValue = item.name,
    isCreating = null,
    createValue = '',
    contextMenu = null,
    showDeleteDialog = false,
  } = treeItemState || {};
  const editInputRef = useRef(null);
  const createInputRef = useRef(null);
  const longPressHandlers = useLongPress(
    (event) => {
      const touch = event.touches[0];
      const pageX = touch.pageX;
      const pageY = touch.pageY;

      treeItemState((draft) => {
        draft.contextMenu = { x: pageX, y: pageY };
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
    if (isCreating) createInputRef.current?.focus();
  }, [isCreating]);

  useEffect(() => {
    const handleClick = () => {
      treeItemState((draft) => {
        draft.contextMenu = null;
      });
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
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

  const submitCreate = async () => {
    const nextName = createValue.trim();
    if (nextName) {
      const created = await onCreate(row, isCreating, nextName);
      if (!created) return;
    }
    treeItemState((draft) => {
      draft.isCreating = null;
      draft.createValue = '';
    });
  };

  const handleClick = () => {
    if (isEditing) return;
    if (item.type === 'folder') {
      onToggle(row);
    } else {
      onOpenFile(row);
    }
  };

  const startCreate = (type) => {
    treeItemState((draft) => {
      draft.isCreating = type;
      draft.contextMenu = null;
    });
    if (item.type === 'folder' && !isExpanded) {
      onToggle(row, { expandOnly: true });
    }
  };

  return (
    <>
      <div
        {...longPressHandlers}
        onContextMenu={(event) => {
          if (isEditing) return;
          event.preventDefault();
          treeItemState((draft) => {
            draft.contextMenu = { x: event.pageX, y: event.pageY };
          });
        }}
        draggable={!item.isRoot}
        onDragStart={(event) => onDragStart(event, row)}
        onDragOver={(event) => onDragOver(event, row)}
        onDragEnter={(event) => onDragEnter(event, row)}
        onDragLeave={onDragLeave}
        onDrop={(event) => onDrop(event, row)}
        onDragEnd={onDragEnd}
        className={`${styles.item} ${isActive ? styles.active : ''} ${isDropTarget ? styles.dropTarget : ''} ${isDragged ? styles.dragging : ''}`}
      >
        <button
          type="button"
          onClick={handleClick}
          className={styles.itemButton}
          style={{ '--tree-indent': `${16 + level * 16}px` }}
        >
          <span className={styles.iconContainer}>
            {item.type === 'folder' ? (
              isExpanded ? (
                <Icons.ChevronDown />
              ) : (
                <Icons.ChevronRight />
              )
            ) : null}
          </span>
          <span
            className={`${styles.typeIcon} ${
              item.type === 'folder' ? styles.typeIconFolder : styles.typeIconFile
            }`}
          >
            {isLoading ? (
              <div className={styles.spinner} />
            ) : item.type === 'folder' ? (
              <Icons.Folder open={isExpanded} />
            ) : isMediaFile(item.name) ? (
              <Icons.Image />
            ) : (
              <Icons.File />
            )}
          </span>

          {isEditing ? (
            <input
              ref={editInputRef}
              value={editValue}
              onChange={(event) =>
                treeItemState((draft) => {
                  draft.editValue = event.target.value;
                })
              }
              onBlur={submitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitRename();
                if (event.key === 'Escape') {
                  treeItemState((draft) => {
                    draft.isEditing = false;
                  });
                }
              }}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              className={styles.editInput}
            />
          ) : (
            <Tooltip
              content={item.isRoot ? item.name : `/${pathStr}`}
              className={styles.nameTooltip}
            >
              <span
                className={styles.name}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  treeItemState((draft) => {
                    draft.isEditing = true;
                  });
                }}
              >
                {renderHighlightedName(item.name, pathStr, filterText)}
              </span>
            </Tooltip>
          )}
        </button>
      </div>

      {isCreating && (
        <div
          style={{ '--tree-indent': `${16 + (level + 1) * 16}px` }}
          className={styles.createInputContainer}
        >
          <span className={styles.iconContainer} />
          <span className={styles.typeIcon}>
            {isCreating === 'folder' ? <Icons.Folder /> : <Icons.File />}
          </span>
          <input
            ref={createInputRef}
            value={createValue}
            onChange={(event) =>
              treeItemState((draft) => {
                draft.createValue = event.target.value;
              })
            }
            onBlur={submitCreate}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitCreate();
              if (event.key === 'Escape') {
                treeItemState((draft) => {
                  draft.isCreating = null;
                });
              }
            }}
            className={styles.editInput}
          />
        </div>
      )}

      <SidebarContextMenu
        item={item}
        pathStr={pathStr}
        isLoading={isLoading}
        isExpanded={isExpanded}
        position={contextMenu}
        onClose={() =>
          treeItemState((draft) => {
            draft.contextMenu = null;
          })
        }
        onStartCreate={startCreate}
        onStartRename={() => {
          treeItemState((draft) => {
            draft.isEditing = true;
            draft.contextMenu = null;
          });
        }}
        onStartDelete={() => {
          treeItemState((draft) => {
            draft.showDeleteDialog = true;
            draft.contextMenu = null;
          });
        }}
        onOpenWith={(viewType) => {
          onOpenFile(row, { viewType });
          treeItemState((draft) => {
            draft.contextMenu = null;
          });
        }}
      />

      <Dialog
        isOpen={showDeleteDialog}
        title="Delete Item"
        message={
          <>
            Are you sure you want to delete <strong>{item.name}</strong>?
            <div className={dialogStyles.detailBox}>{pathStr}</div>
            <div className={dialogStyles.deleteWarning}>This action cannot be undone.</div>
          </>
        }
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={async () => {
          await onDelete(row);
          treeItemState((draft) => {
            draft.showDeleteDialog = false;
          });
        }}
        onCancel={() =>
          treeItemState((draft) => {
            draft.showDeleteDialog = false;
          })
        }
      />
    </>
  );
}
