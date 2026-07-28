import Node from '@/components/state/Node';
import React from 'react';
import CreateRowInput from './CreateRowInput';
import TreeItemContent from './TreeItemContent';
import { TreeItemState, useTreeItemControls } from './useTreeItemControls';

export { TreeItemState };

export default function TreeItem({ row, filterText = '', onCancelCreate, onCreate, ...props }) {
  if (row.isCreateRow) {
    return (
      <Node id={row.key}>
        <CreateRowInput row={row} onCreate={onCreate} onCancelCreate={onCancelCreate} />
      </Node>
    );
  }

  return <TreeItemWithControls row={row} filterText={filterText} {...props} />;
}

function TreeItemWithControls({ row, onOpenFile, onRename, onStartCreate, ...props }) {
  return (
    <Node id={row?.pathStr || row?.item?.name || 'TreeItem'}>
      <TreeItemControlled
        row={row}
        onOpenFile={onOpenFile}
        onRename={onRename}
        onStartCreate={onStartCreate}
        {...props}
      />
    </Node>
  );
}

function TreeItemControlled({ row, onOpenFile, onRename, onStartCreate, ...props }) {
  const controls = useTreeItemControls({ row, onOpenFile, onRename, onStartCreate });
  return (
    <div style={{ '--tree-indent': `${16 + row.level * 16}px` }}>
      <TreeItemContent row={row} controls={controls} onOpenFile={onOpenFile} {...props} />
    </div>
  );
}
