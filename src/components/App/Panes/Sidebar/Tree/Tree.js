import React from 'react';
import TreeItem from '../TreeItem';
import VirtualList from '../VirtualList';
import styles from './Tree.module.css';

const ROW_HEIGHT = 34;

export default function SidebarTree({
  rows,
  activeTabId,
  scrollToIndex,
  filterText,
  expandedFolders,
  loadingPaths,
  draggedPath,
  dropTargetPath,
  isOpen,
  hasFileSystem,
  onToggle,
  onOpenFile,
  onRename,
  onCreate,
  onStartCreate,
  onCancelCreate,
  onDelete,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
}) {
  return (
    <>
      <VirtualList
        className={`${styles.treeArea} scrollHide ${
          isOpen ? styles.treeAreaInteractive : styles.treeAreaInactive
        }`}
        items={rows}
        itemHeight={ROW_HEIGHT}
        scrollKey={activeTabId}
        scrollToIndex={scrollToIndex}
        renderItem={(row) => (
          <TreeItem
            row={row}
            filterText={filterText}
            isActive={!row.isCreateRow && activeTabId === row.pathStr}
            isExpanded={
              row.isCreateRow
                ? false
                : row.item.isRoot ||
                  !!filterText ||
                  (!!row.item.children && expandedFolders[row.pathStr] !== false)
            }
            isLoading={!row.isCreateRow && !!loadingPaths[row.pathStr]}
            isDragged={!row.isCreateRow && draggedPath === row.pathStr}
            isDropTarget={!row.isCreateRow && dropTargetPath === row.pathStr}
            onToggle={onToggle}
            onOpenFile={onOpenFile}
            onRename={onRename}
            onCreate={onCreate}
            onStartCreate={onStartCreate}
            onCancelCreate={onCancelCreate}
            onDelete={onDelete}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
          />
        )}
      />
      {rows.length === 1 && !hasFileSystem && (
        <div className={styles.noFiles}>No files found matching "{filterText}"</div>
      )}
    </>
  );
}
