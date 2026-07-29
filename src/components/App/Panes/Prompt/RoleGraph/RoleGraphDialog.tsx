import type { RoleGraphDialogProps } from '@/components/App/Panes/Prompt/prompt-types';
import Dialog from '@/components/ui/Dialog';
import React from 'react';
import styles from './RoleGraphDialog.module.css';
import RoleGraphEditor from './RoleGraphEditor';

export default function RoleGraphDialog({
  isOpen,
  onCancel,
  onConfirm,
  roleGraph,
  modelOptions = [],
  defaultModelId = '',
  disabled = false,
  onChange,
}: RoleGraphDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      title="Team role graph"
      onCancel={onCancel}
      onConfirm={onConfirm ?? onCancel}
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
