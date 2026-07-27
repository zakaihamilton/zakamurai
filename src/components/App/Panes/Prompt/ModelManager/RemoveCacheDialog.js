import Dialog from '@/components/ui/Dialog';
import React from 'react';

export default function RemoveCacheDialog({ model, onCancel, onConfirm }) {
  return (
    <Dialog
      isOpen={Boolean(model)}
      title="Remove cached model?"
      message={
        model ? `${model.name} will need to be downloaded again before it can run locally.` : ''
      }
      confirmText="Remove cache"
      cancelText="Keep cached"
      type="danger"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
