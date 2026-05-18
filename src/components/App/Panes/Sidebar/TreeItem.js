import { Icons } from '@/components/Core/Base/Icons';
import ContextMenu from '@/components/Widgets/ContextMenu/ContextMenu';
import Dialog from '@/components/Widgets/Dialog/Dialog';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { isMediaFile } from '@/utils/file';
import React, { useEffect, useRef, useState } from 'react';
import styles from './TreeItem.module.css';

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
  const { item, level, pathStr } = row;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.name);
  const [isCreating, setIsCreating] = useState(null);
  const [createValue, setCreateValue] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const editInputRef = useRef(null);
  const createInputRef = useRef(null);

  useEffect(() => {
    setEditValue(item.name);
  }, [item.name]);

  useEffect(() => {
    if (isEditing) editInputRef.current?.focus();
  }, [isEditing]);

  useEffect(() => {
    if (isCreating) createInputRef.current?.focus();
  }, [isCreating]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const submitRename = async () => {
    const nextName = editValue.trim();
    if (nextName && nextName !== item.name) {
      const renamed = await onRename(row, nextName);
      if (!renamed) return;
    }
    setIsEditing(false);
  };

  const submitCreate = async () => {
    const nextName = createValue.trim();
    if (nextName) {
      const created = await onCreate(row, isCreating, nextName);
      if (!created) return;
    }
    setIsCreating(null);
    setCreateValue('');
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
    setIsCreating(type);
    setContextMenu(null);
    if (item.type === 'folder' && !isExpanded) {
      onToggle(row, { expandOnly: true });
    }
  };

  return (
    <>
      <div
        onClick={handleClick}
        onContextMenu={(event) => {
          if (isEditing) return;
          event.preventDefault();
          setContextMenu({ x: event.pageX, y: event.pageY });
        }}
        onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && handleClick()}
        draggable={!item.isRoot}
        onDragStart={(event) => onDragStart(event, row)}
        onDragOver={(event) => onDragOver(event, row)}
        onDragEnter={(event) => onDragEnter(event, row)}
        onDragLeave={onDragLeave}
        onDrop={(event) => onDrop(event, row)}
        onDragEnd={onDragEnd}
        className={`${styles.item} ${isActive ? styles.active : ''} ${isDropTarget ? styles.dropTarget : ''} ${isDragged ? styles.dragging : ''}`}
        style={{
          paddingLeft: `${16 + level * 16}px`,
          paddingRight: '16px',
          paddingTop: '8px',
          paddingBottom: '8px',
        }}
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
          className={styles.typeIcon}
          style={{ color: item.type === 'folder' ? 'var(--accent)' : 'var(--text-muted)' }}
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
            onChange={(event) => setEditValue(event.target.value)}
            onBlur={submitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitRename();
              if (event.key === 'Escape') setIsEditing(false);
            }}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            className={styles.editInput}
          />
        ) : (
          <Tooltip content={item.isRoot ? item.name : `/${pathStr}`} className={styles.nameTooltip}>
            <span
              className={styles.name}
              onDoubleClick={() => {
                if (!item.isRoot) setIsEditing(true);
              }}
            >
              {renderHighlightedName(item.name, pathStr, filterText)}
            </span>
          </Tooltip>
        )}

        {!isEditing && item.type === 'folder' && (
          <div className={styles.itemActions}>
            <Tooltip content="New File">
              <button
                type="button"
                className={styles.miniActionBtn}
                onClick={(event) => {
                  event.stopPropagation();
                  startCreate('file');
                }}
              >
                <Icons.FilePlus />
              </button>
            </Tooltip>
            <Tooltip content="New Folder">
              <button
                type="button"
                className={styles.miniActionBtn}
                onClick={(event) => {
                  event.stopPropagation();
                  startCreate('folder');
                }}
              >
                <Icons.FolderPlus />
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      {isCreating && (
        <div
          style={{
            paddingLeft: `${16 + (level + 1) * 16}px`,
            paddingRight: '16px',
            paddingTop: '8px',
            paddingBottom: '8px',
          }}
          className={styles.createInputContainer}
        >
          <span className={styles.iconContainer} />
          <span className={styles.typeIcon}>
            {isCreating === 'folder' ? <Icons.Folder /> : <Icons.File />}
          </span>
          <input
            ref={createInputRef}
            value={createValue}
            onChange={(event) => setCreateValue(event.target.value)}
            onBlur={submitCreate}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitCreate();
              if (event.key === 'Escape') setIsCreating(null);
            }}
            className={styles.editInput}
          />
        </div>
      )}

      <ContextMenu position={contextMenu} onClose={() => setContextMenu(null)}>
        {item.type === 'folder' && (
          <>
            <button
              type="button"
              onClick={() => startCreate('file')}
              className={styles.contextMenuOption}
            >
              <Icons.FilePlus />
              New File
            </button>
            <button
              type="button"
              onClick={() => startCreate('folder')}
              className={styles.contextMenuOption}
            >
              <Icons.FolderPlus />
              New Folder
            </button>
            <div className={styles.divider} />
          </>
        )}
        {!item.isRoot && (
          <button
            type="button"
            onClick={() => {
              setIsEditing(true);
              setContextMenu(null);
            }}
            className={styles.contextMenuOption}
          >
            <Icons.Edit />
            Rename
          </button>
        )}
        {!item.isRoot && (
          <button
            type="button"
            onClick={() => {
              setShowDeleteDialog(true);
              setContextMenu(null);
            }}
            className={`${styles.deleteOption} ${styles.contextMenuOption}`}
          >
            <Icons.Trash />
            Delete
          </button>
        )}
      </ContextMenu>

      <Dialog
        isOpen={showDeleteDialog}
        title="Delete Item"
        message={
          <>
            Are you sure you want to delete <strong>{item.name}</strong>?
            <div
              style={{
                marginTop: '12px',
                fontSize: '12px',
                opacity: 0.8,
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                background: 'rgba(0,0,0,0.2)',
                padding: '8px',
                borderRadius: '4px',
              }}
            >
              {pathStr}
            </div>
            <div style={{ marginTop: '12px' }}>This action cannot be undone.</div>
          </>
        }
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={async () => {
          await onDelete(row);
          setShowDeleteDialog(false);
        }}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </>
  );
}
