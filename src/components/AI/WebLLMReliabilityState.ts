import type { WebLLMRecoveryReason } from './types';

const CIRCUIT_BREAKER_TTL_MS = 5 * 60_000;
const modelCircuitBreakers = new Map<
  string,
  { failures: number; openUntil: number; reason: WebLLMRecoveryReason }
>();

export const noteModelFailure = (modelId: string, reason: WebLLMRecoveryReason): void => {
  const current = modelCircuitBreakers.get(modelId);
  const failures = current?.reason === reason ? current.failures + 1 : 1;
  modelCircuitBreakers.set(modelId, {
    failures,
    reason,
    openUntil:
      reason === 'stalled' && failures >= 2 ? Date.now() + CIRCUIT_BREAKER_TTL_MS : Date.now(),
  });
};

export const clearModelFailure = (modelId: string): void => {
  modelCircuitBreakers.delete(modelId);
};

export const isModelCircuitOpen = (modelId: string): boolean => {
  const breaker = modelCircuitBreakers.get(modelId);
  return Boolean(breaker && breaker.openUntil > Date.now());
};

export const clearModelCircuitBreakers = (): void => {
  modelCircuitBreakers.clear();
};
