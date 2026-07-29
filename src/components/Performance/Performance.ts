const MARK_PREFIX = 'zakamurai:';

export function markPerformance(name: string): void {
  if (typeof performance?.mark !== 'function') return;
  performance.mark(`${MARK_PREFIX}${name}`);
}

export function measurePerformance(name: string, start: string, end: string): PerformanceMeasure | null {
  if (typeof performance?.measure !== 'function') return null;
  try {
    return performance.measure(
      `${MARK_PREFIX}${name}`,
      `${MARK_PREFIX}${start}`,
      `${MARK_PREFIX}${end}`,
    );
  } catch {
    return null;
  }
}

export async function getOptionalMemoryMeasurement(): Promise<number | null> {
  if (typeof performance?.measureUserAgentSpecificMemory !== 'function') return null;
  try {
    const measurement = await performance.measureUserAgentSpecificMemory();
    return Number.isFinite(measurement?.bytes) ? measurement.bytes : null;
  } catch {
    return null;
  }
}

export function getLocalPerformanceMeasures() {
  if (typeof performance?.getEntriesByType !== 'function') return [];
  return performance
    .getEntriesByType('measure')
    .filter((entry) => entry.name.startsWith(MARK_PREFIX))
    .map(({ name, duration, startTime }) => ({ name, duration, startTime }));
}
