import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearModelCircuitBreakers,
  clearModelFailure,
  isModelCircuitOpen,
  noteModelFailure,
} from './WebLLMReliabilityState';

describe('WebLLM reliability circuit breakers', () => {
  afterEach(() => {
    clearModelCircuitBreakers();
    vi.useRealTimers();
  });

  it('opens after two repeated stalls and closes after a health check', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    noteModelFailure('model', 'stalled');
    expect(isModelCircuitOpen('model')).toBe(false);
    noteModelFailure('model', 'stalled');
    expect(isModelCircuitOpen('model')).toBe(true);
    clearModelFailure('model');
    expect(isModelCircuitOpen('model')).toBe(false);
  });

  it('expires an open circuit after its bounded session cooldown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    noteModelFailure('model', 'stalled');
    noteModelFailure('model', 'stalled');
    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(isModelCircuitOpen('model')).toBe(false);
  });
});
