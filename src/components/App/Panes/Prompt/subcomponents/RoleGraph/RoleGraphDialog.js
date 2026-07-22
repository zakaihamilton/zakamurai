import Dialog from '@/components/ui/Dialog';
import React from 'react';
import RoleGraphEditor from './RoleGraphEditor';

export default function RoleGraphDialog({
  isOpen,
  onCancel,
  roleGraph,
  modelOptions = [],
  defaultModelId = '',
  disabled = false,
  onChange,
  className = '',
}) {
  return (
    <Dialog
      isOpen={isOpen}
      title="Team role graph"
      onCancel={onCancel}
      footer={null}
      className={className}
    >
      <RoleGraphEditor
        roleGraph={roleGraph}
        modelOptions={modelOptions}
        defaultModelId={defaultModelId}
        disabled={disabled}
        onChange={onChange}
        showTitle={false}
      />
    </Dialog>
  );
}
