import { reportDiagnostic } from '@/components/Diagnostics';
import type { SettingsStorageHealth, StorageLayer } from './storage-types';

export function createSettingsHealthTracker() {
  let lastStorageHealth: SettingsStorageHealth = {
    status: 'healthy',
    layer: null,
    message: null,
    usage: null,
    quota: null,
    quotaWarning: false,
    lastSuccessfulPersistAt: null,
  };

  const refreshStorageEstimate = async (): Promise<SettingsStorageHealth> => {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.estimate !== 'function') {
      return lastStorageHealth;
    }
    try {
      const { usage = null, quota = null } = await navigator.storage.estimate();
      const quotaWarning =
        usage != null &&
        quota != null &&
        Number.isFinite(usage) &&
        Number.isFinite(quota) &&
        quota > 0 &&
        usage / quota >= 0.8;
      lastStorageHealth = { ...lastStorageHealth, usage, quota, quotaWarning };
      if (quotaWarning) {
        reportDiagnostic({
          source: 'storage',
          severity: 'warning',
          message: 'Browser storage is at least 80% full.',
        });
      }
    } catch {
      // Storage estimates are advisory and unsupported in some privacy modes.
    }
    return lastStorageHealth;
  };

  const recordStorageSuccess = async (layer: StorageLayer): Promise<void> => {
    lastStorageHealth = {
      ...lastStorageHealth,
      status: layer === 'localStorage' ? 'fallback' : 'healthy',
      layer,
      lastSuccessfulPersistAt: Date.now(),
    };
    await refreshStorageEstimate();
  };

  const recordStorageFailure = (message: string): void => {
    lastStorageHealth = { ...lastStorageHealth, status: 'write-failed', layer: 'localStorage' };
    reportDiagnostic({ source: 'storage', severity: 'error', message });
  };

  const getStorageHealth = (): SettingsStorageHealth => ({ ...lastStorageHealth });

  return {
    getStorageHealth,
    refreshStorageHealth: refreshStorageEstimate,
    recordStorageSuccess,
    recordStorageFailure,
  };
}
