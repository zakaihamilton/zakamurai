import Dialog from '@/components/ui/Dialog';
import type { RemoveCacheDialogProps } from '../prompt-types';
import styles from './RemoveCacheDialog.module.css';

export default function RemoveCacheDialog({ model, onCancel, onConfirm }: RemoveCacheDialogProps) {
  if (!model) return null;

  return (
    <Dialog
      isOpen={!!model}
      title="Remove cached model?"
      message={`Remove "${model.label || model.id}" from the local cache?`}
      onCancel={onCancel}
      onConfirm={onConfirm}
      confirmText="Remove"
      cancelText="Cancel"
      type="danger"
      className={styles.dialog}
    />
  );
}
