import { describe, expect, it } from 'vitest';
import {
  WebLLMAttemptError,
  WebLLMStallError,
  errorMessage,
  isAbortError,
  recoveryReason,
  unwrapAttemptError,
} from './WebLLMRecovery';

describe('WebLLM recovery helpers', () => {
  it('preserves attempt phase and unwraps the original failure', () => {
    const cause = new Error('worker stopped');
    const error = new WebLLMAttemptError('generation', cause);

    expect(error.phase).toBe('generation');
    expect(unwrapAttemptError(error)).toBe(cause);
    expect(errorMessage(error)).toBe('worker stopped');
  });

  it('classifies stalls and recoverable runtime failures', () => {
    expect(recoveryReason(new WebLLMStallError('initialization'))).toBe('stalled');
    expect(recoveryReason(new Error('GPUDevice was lost'))).toBe('device-lost');
    expect(recoveryReason(new Error('failed to allocate buffer'))).toBe('out-of-memory');
    expect(recoveryReason(new Error('worker terminated'))).toBe('worker-failure');
    expect(recoveryReason(new Error('invalid prompt'))).toBeNull();
  });

  it('detects aborts from signals and WebLLM worker errors', () => {
    const controller = new AbortController();
    controller.abort();
    expect(isAbortError(new Error('anything'), controller.signal)).toBe(true);
    expect(isAbortError(new Error('Message error should not be 0'))).toBe(true);
    expect(isAbortError(new Error('ordinary failure'))).toBe(false);
  });
});
