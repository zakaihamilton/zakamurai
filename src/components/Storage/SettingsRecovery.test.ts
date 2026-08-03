import { describe, expect, it } from 'vitest';
import {
  MAX_RECOVERY_CHECKPOINTS,
  appendRecoveryCheckpoint,
  createRecoveryCheckpoint,
  shouldPreserveRecoveryCheckpoint,
} from './SettingsRecovery';

describe('Settings recovery helpers', () => {
  it('preserves explicit checkpoints over automatic recovery writes', () => {
    expect(shouldPreserveRecoveryCheckpoint('storage-recovery', 'ai-change')).toBe(true);
    expect(shouldPreserveRecoveryCheckpoint('storage-recovery', undefined)).toBe(false);
    expect(shouldPreserveRecoveryCheckpoint('ai-change', 'storage-recovery')).toBe(false);
  });

  it('creates a versioned checkpoint with stable caller-provided identity', () => {
    expect(createRecoveryCheckpoint({ id: 'checkpoint-1', reason: 'ai-change' })).toEqual(
      expect.objectContaining({ id: 'checkpoint-1', reason: 'ai-change', version: 1 }),
    );
  });

  it('deduplicates history and retains only the newest bounded entries', () => {
    const history = Array.from({ length: MAX_RECOVERY_CHECKPOINTS }, (_, index) => ({
      id: `checkpoint-${index}`,
    })) as never[];
    const next = appendRecoveryCheckpoint(history, {
      id: 'checkpoint-new',
    } as never);
    expect(next).toHaveLength(MAX_RECOVERY_CHECKPOINTS);
    expect(next.at(-1)?.id).toBe('checkpoint-new');
    expect(appendRecoveryCheckpoint(next, { id: 'checkpoint-new' } as never)).toHaveLength(
      MAX_RECOVERY_CHECKPOINTS,
    );
  });
});
