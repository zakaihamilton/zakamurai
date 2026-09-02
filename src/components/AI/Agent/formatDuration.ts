/** Format an elapsed duration with minutes and whole seconds for user-facing run diagnostics. */
export const formatDuration = (milliseconds: number): string => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '—';

  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
};

/** Format a short latency without exposing millisecond precision. */
export const formatLatency = (milliseconds: number): string => {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  if (milliseconds < 1000) return 'under 1s';
  return formatDuration(milliseconds);
};
