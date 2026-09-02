import { describe, expect, it } from 'vitest';
import { formatDuration, formatLatency } from './formatDuration';

describe('formatDuration', () => {
  it('formats elapsed time as minutes and zero-padded seconds', () => {
    expect(formatDuration(1_000)).toBe('0m 01s');
    expect(formatDuration(61_000)).toBe('1m 01s');
    expect(formatDuration(125_500)).toBe('2m 06s');
  });

  it('keeps sub-second durations in the same minutes-and-seconds format', () => {
    expect(formatDuration(250)).toBe('0m 00s');
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });

  it('formats sub-second latency without exposing milliseconds', () => {
    expect(formatLatency(20)).toBe('under 1s');
    expect(formatLatency(61_000)).toBe('1m 01s');
    expect(formatLatency(-1)).toBe('—');
  });
});
