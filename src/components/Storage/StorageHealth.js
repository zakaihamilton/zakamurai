import { createState } from '@/components/state/State';

export const STORAGE_RECOVERY_EVENT = 'zakamurai:export-recovery-zip';

export const StorageHealthState = createState('StorageHealthState');

export function storageFailureMessage(layer) {
  const location = layer === 'fallback' ? 'browser storage' : 'IndexedDB';
  return `Project changes are still open, but ${location} could not save them. Export a ZIP now to keep a copy.`;
}

export function requestRecoveryExport() {
  window.dispatchEvent(new Event(STORAGE_RECOVERY_EVENT));
}
