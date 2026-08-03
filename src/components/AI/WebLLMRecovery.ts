import type { WebLLMRecoveryReason } from '@/components/AI/types';

export class WebLLMStallError extends Error {
  constructor(readonly phase: 'initialization' | 'generation') {
    super(
      phase === 'initialization'
        ? 'Local AI model initialization stopped making progress.'
        : 'Local AI generation stopped making progress.',
    );
    this.name = 'WebLLMStallError';
  }
}

export class WebLLMAttemptError extends Error {
  constructor(
    readonly phase: 'initialization' | 'generation',
    readonly cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'WebLLMAttemptError';
  }
}

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const unwrapAttemptError = (error: unknown): unknown =>
  error instanceof WebLLMAttemptError ? error.cause : error;

export const isAbortError = (error: unknown, signal?: AbortSignal): boolean => {
  const unwrapped = unwrapAttemptError(error) as { name?: string; message?: string };
  return (
    Boolean(signal?.aborted) ||
    unwrapped?.name === 'AbortError' ||
    (unwrapped?.message || '').includes('Message error should not be 0')
  );
};

export const recoveryReason = (error: unknown): WebLLMRecoveryReason | null => {
  const unwrapped = unwrapAttemptError(error);
  if (unwrapped instanceof WebLLMStallError) return 'stalled';
  const message = errorMessage(unwrapped);
  if (/device\s*(?:was\s*)?lost|gpudevice.*lost/i.test(message)) return 'device-lost';
  if (
    /out of memory|memory allocation|failed to allocate|allocation failed|exceeds.*(?:buffer|memory)/i.test(
      message,
    )
  ) {
    return 'out-of-memory';
  }
  if (
    /worker|message error should not be 0|message channel|postmessage|terminated|backend.*unavailable/i.test(
      message,
    )
  ) {
    return 'worker-failure';
  }
  return null;
};
