import Dialog from '@/components/ui/Dialog';
import React from 'react';
import styles from './RoleGraphDialog.module.css';
import RoleGraphEditor from './RoleGraphEditor';

export default function RoleGraphDialog({
  isOpen,
  onCancel,
  roleGraph,
  modelOptions = [],
  defaultModelId = '',
  disabled = false,
  onChange,
}) {
  return (
    <Dialog
      isOpen={isOpen}
      title="Team role graph"
      onCancel={onCancel}
      footer={null}
      className={styles.roleGraphDialog}
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
