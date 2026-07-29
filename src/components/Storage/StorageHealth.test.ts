import { describe, expect, it, vi } from 'vitest';
import {
  STORAGE_RECOVERY_EVENT,
  requestRecoveryExport,
  storageFailureMessage,
} from './StorageHealth';

describe('storage recovery helpers', () => {
  it('describes the failed storage layer', () => {
    expect(storageFailureMessage('fallback')).toContain('browser storage');
    expect(storageFailureMessage('indexeddb')).toContain('IndexedDB');
  });

  it('dispatches an export request', () => {
    const listener = vi.fn();
    window.addEventListener(STORAGE_RECOVERY_EVENT, listener);
    requestRecoveryExport();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(STORAGE_RECOVERY_EVENT, listener);
  });
});
