import type { RecoveryCheckpoint } from './storage-types';

export const RECOVERY_CHECKPOINT_KEY = 'zakamurai_recovery_checkpoint_v1';
export const RECOVERY_CHECKPOINT_HISTORY_KEY = 'zakamurai_recovery_checkpoint_history_v1';
export const MAX_RECOVERY_CHECKPOINTS = 20;

export function shouldPreserveRecoveryCheckpoint(
  nextReason: string | undefined,
  currentReason: string | undefined,
): boolean {
  return (
    nextReason === 'storage-recovery' && Boolean(currentReason) && currentReason !== nextReason
  );
}

export function createRecoveryCheckpoint(
  snapshot: Partial<RecoveryCheckpoint>,
): Partial<RecoveryCheckpoint> {
  return {
    version: 1,
    id:
      typeof snapshot.id === 'string'
        ? snapshot.id
        : `checkpoint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: Date.now(),
    ...snapshot,
  };
}

export function appendRecoveryCheckpoint(
  history: RecoveryCheckpoint[],
  checkpoint: RecoveryCheckpoint,
): RecoveryCheckpoint[] {
  return [...history.filter((item) => item.id !== checkpoint.id), checkpoint].slice(
    -MAX_RECOVERY_CHECKPOINTS,
  );
}
