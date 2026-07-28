import Dialog from '@/components/ui/Dialog';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { isMediaFile } from '@/utils/file';
import React from 'react';
import SidebarContextMenu from './SidebarContextMenu';
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

function HighlightedName({ name, pathStr, filterText }) {
  const ranges = getNameHighlightRanges(name, pathStr, filterText);
  if (ranges.length === 0) return name;

  const parts = [];
  let cursor = 0;
  for (const range of ranges) {
    if (cursor < range.start) parts.push(name.slice(cursor, range.start));
    parts.push(
      <mark key={`${range.start}-${range.end}`} className={styles.nameMatch}>
        {name.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  if (cursor < name.length) parts.push(name.slice(cursor));
  return parts;
}

export default function TreeItemContent({
  controls,
  filterText,
  isActive,
  isDragged,
  isDropTarget,
  isExpanded,
  isLoading,
  onDelete,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDragStart,
  onDrop,
  onOpenFile,
  onToggle,
  row,
}) {
  const { item, pathStr } = row;
  const handleClick = () => {
    if (controls.isEditing) return;
    if (item.type === 'folder') onToggle(row);
    else onOpenFile(row);
  };

  return (
    <>
      <div
        {...controls.longPressHandlers}
        onContextMenu={controls.handleContextMenu}
        draggable={!item.isRoot}
        onDragStart={(event) => onDragStart(event, row)}
        onDragOver={(event) => onDragOver(event, row)}
        onDragEnter={(event) => onDragEnter(event, row)}
        onDragLeave={onDragLeave}
        onDrop={(event) => onDrop(event, row)}
        onDragEnd={onDragEnd}
        className={`${styles.item} ${isActive ? styles.active : ''} ${isDropTarget ? styles.dropTarget : ''} ${isDragged ? styles.dragging : ''}`}
      >
        <button type="button" onClick={handleClick} className={styles.itemButton}>
          <span className={styles.iconContainer}>
            {item.type === 'folder' &&
              (isExpanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />)}
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

          {controls.isEditing ? (
            <input
              ref={controls.editInputRef}
              value={controls.editValue}
              onChange={(event) => controls.setEditValue(event.target.value)}
              onBlur={controls.submitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') controls.submitRename();
                if (event.key === 'Escape') controls.stopEditing();
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
                  controls.startRename();
                }}
              >
                <HighlightedName name={item.name} pathStr={pathStr} filterText={filterText} />
              </span>
            </Tooltip>
          )}
        </button>
      </div>

      <SidebarContextMenu
        item={item}
        pathStr={pathStr}
        isLoading={isLoading}
        isExpanded={isExpanded}
        position={controls.contextMenu}
        onClose={controls.closeContextMenu}
        onStartCreate={controls.startCreate}
        onStartRename={controls.startRename}
        onStartDelete={controls.startDelete}
        onOpenWith={controls.openWith}
      />

      <Dialog
        isOpen={controls.showDeleteDialog}
        title="Delete Item"
        message={
          <>
            Are you sure you want to delete <strong>{item.name}</strong>?
            <div className={styles.detailBox}>{pathStr}</div>
            <div className={styles.deleteWarning}>This action cannot be undone.</div>
          </>
        }
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={async () => {
          await onDelete(row);
          controls.setShowDeleteDialog(false);
        }}
        onCancel={() => controls.setShowDeleteDialog(false)}
      />
    </>
  );
}
