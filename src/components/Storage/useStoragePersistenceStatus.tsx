import { reportDiagnostic } from '@/components/Diagnostics';
import Settings from '@/components/Storage/Settings';
import {
  StorageHealthState,
  requestRecoveryExport,
  storageFailureMessage,
  storageHealthMessage,
} from '@/components/Storage/StorageHealth';
import type { StorageHealthStateShape } from '@/components/state/domain-types';
import type { Draft } from '@/components/state/types';
import { useNotification } from '@/components/ui/Notification';
import { useCallback, useRef } from 'react';

const SAVE_FAIL_MESSAGE =
  'Could not save project data — browser storage is full. Export or free space to avoid data loss.';

export default function useStoragePersistenceStatus() {
  const { addNotification } = useNotification();
  const storageHealthState = StorageHealthState.usePassiveState();
  const updateStorageHealth = useCallback(
    (
      update: Partial<StorageHealthStateShape> | ((draft: Draft<StorageHealthStateShape>) => void),
    ) => {
      if (typeof storageHealthState === 'function') {
        storageHealthState(update as (draft: Draft<StorageHealthStateShape>) => void);
      }
    },
    [storageHealthState],
  );
  const addNotificationRef = useRef(addNotification);
  addNotificationRef.current = addNotification;
  const saveFailureNotifiedRef = useRef(false);
  const quotaWarningNotifiedRef = useRef(false);

  return useCallback(
    (ok: boolean | undefined) => {
      if (ok === false) {
        if (saveFailureNotifiedRef.current) return ok;
        saveFailureNotifiedRef.current = true;
        updateStorageHealth((draft) => {
          draft.status = 'write-failed';
          draft.layer = 'fallback';
          draft.message = storageFailureMessage('fallback');
        });
        addNotificationRef.current(SAVE_FAIL_MESSAGE, 'error', 12000, {
          label: 'Export ZIP',
          onClick: requestRecoveryExport,
        });
        reportDiagnostic({ source: 'storage', severity: 'error', message: SAVE_FAIL_MESSAGE });
      } else if (ok === true) {
        saveFailureNotifiedRef.current = false;
        const health = Settings.getStorageHealth?.() || { status: 'healthy', layer: null };
        updateStorageHealth((draft) => {
          draft.status = health.status;
          draft.layer = health.layer;
          draft.usage = health.usage ?? undefined;
          draft.quota = health.quota ?? undefined;
          draft.lastSuccessfulPersistAt = health.lastSuccessfulPersistAt ?? null;
          draft.message =
            storageHealthMessage({
              ...health,
              usage: health.usage ?? undefined,
              quota: health.quota ?? undefined,
            }) ?? null;
        });
        if (health.quotaWarning && !quotaWarningNotifiedRef.current) {
          quotaWarningNotifiedRef.current = true;
          addNotificationRef.current(
            storageHealthMessage({
              ...health,
              usage: health.usage ?? undefined,
              quota: health.quota ?? undefined,
            }) ?? '',
            'warning',
            12000,
            { label: 'Export ZIP', onClick: requestRecoveryExport },
          );
        } else if (!health.quotaWarning) {
          quotaWarningNotifiedRef.current = false;
        }
      }
      return ok;
    },
    [updateStorageHealth],
  );
}
