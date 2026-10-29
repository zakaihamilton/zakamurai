import Dialog from '@/components/ui/Dialog';

export default function DownloadConfirmation({
  isOpen,
  model,
  onCancel,
  onConfirm,
}: {
  isOpen: boolean;
  model: { name: string; storageMB: number };
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      isOpen={isOpen}
      title="Download local AI model?"
      message={`${model.name} is about ${model.storageMB.toLocaleString()} MB. It downloads to this browser and runs locally on this device.`}
      confirmText="Download and build"
      cancelText="Cancel"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
