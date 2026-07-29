import type { CssCustomProperties } from '@/components/App/types';
import Node from '@/components/state/Node';
import React from 'react';
import CreateRowInput from './CreateRowInput';
import TreeItemContent from './TreeItemContent';
import type { TreeItemContentProps, TreeItemProps } from './sidebar-types';
import { TreeItemState, useTreeItemControls } from './useTreeItemControls';

export { TreeItemState };

export default function TreeItem({
  row,
  filterText = '',
  onCancelCreate,
  onCreate,
  ...props
}: TreeItemProps) {
  if (row.isCreateRow) {
    return (
      <Node id={row.key}>
        <CreateRowInput row={row} onCreate={onCreate} onCancelCreate={onCancelCreate} />
      </Node>
    );
  }

  return <TreeItemWithControls row={row} filterText={filterText} {...props} />;
}

type TreeItemControlledProps = Omit<TreeItemProps, 'onCancelCreate' | 'onCreate'>;

function TreeItemWithControls({
  row,
  onOpenFile,
  onRename,
  onStartCreate,
  ...props
}: TreeItemControlledProps) {
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

function TreeItemControlled({
  row,
  onOpenFile,
  onRename,
  onStartCreate,
  filterText = '',
  ...props
}: TreeItemControlledProps) {
  const controls = useTreeItemControls({ row, onOpenFile, onRename, onStartCreate });
  const indentStyle: CssCustomProperties = { '--tree-indent': `${16 + row.level * 16}px` };
  const contentProps: TreeItemContentProps = {
    row,
    controls,
    filterText,
    onOpenFile,
    ...props,
  };
  return (
    <div style={indentStyle}>
      <TreeItemContent {...contentProps} />
    </div>
  );
}
