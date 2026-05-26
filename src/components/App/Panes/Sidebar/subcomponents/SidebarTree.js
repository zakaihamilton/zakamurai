import React from 'react';
import TreeItem from '../TreeItem';
import VirtualList from '../VirtualList';
import styles from './SidebarTree.module.css';

const ROW_HEIGHT = 34;

export default function SidebarTree({
  rows,
  activeTabId,
  activeIndex,
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
        className={`${styles.treeArea} scrollHide`}
        style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
        items={rows}
        itemHeight={ROW_HEIGHT}
        scrollKey={activeTabId}
        scrollToIndex={activeIndex >= 0 ? activeIndex : null}
        renderItem={(row) => (
          <TreeItem
            row={row}
            filterText={filterText}
            isActive={activeTabId === row.pathStr}
            isExpanded={
              row.item.isRoot ||
              !!filterText ||
              (!!row.item.children && expandedFolders[row.pathStr] !== false)
            }
            isLoading={!!loadingPaths[row.pathStr]}
            isDragged={draggedPath === row.pathStr}
            isDropTarget={dropTargetPath === row.pathStr}
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
        )}
      />
      {rows.length === 1 && !hasFileSystem && (
        <div className={styles.noFiles}>No files found matching "{filterText}"</div>
      )}
    </>
  );
}
