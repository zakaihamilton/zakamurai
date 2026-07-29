import { unloadAllWebLLMEngines } from '@/components/AI/WebLLMAPI';
import { _resetHighlightWorkerForTests } from '@/components/App/Views/EditorArea/highlightClient';
import { Compiler } from '@/utils/compiler';
import { ragSearch } from '@/utils/rag/search-utility';

const MARK_PREFIX = 'zakamurai:';

export function markPerformance(name: string): void {
  if (typeof performance?.mark !== 'function') return;
  performance.mark(`${MARK_PREFIX}${name}`);
}

export function measurePerformance(
  name: string,
  start: string,
  end: string,
): PerformanceMeasure | null {
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

export async function purgeSystemMemory(): Promise<{
  webllmUnloaded: boolean;
  compilerReset: boolean;
  ragUnloaded: boolean;
  gcTriggered: boolean;
}> {
  let webllmUnloaded = false;
  try {
    await unloadAllWebLLMEngines();
    webllmUnloaded = true;
  } catch (error) {
    console.warn('[Performance] Failed to unload WebLLM engines:', error);
  }

  let compilerReset = false;
  try {
    await Compiler.reset();
    compilerReset = true;
  } catch (error) {
    console.warn('[Performance] Failed to reset compiler container:', error);
  }

  let ragUnloaded = false;
  try {
    await ragSearch.unloadModel();
    ragUnloaded = true;
  } catch (error) {
    console.warn('[Performance] Failed to unload RAG model:', error);
  }

  try {
    _resetHighlightWorkerForTests();
  } catch (error) {
    console.warn('[Performance] Failed to reset highlight worker:', error);
  }

  let gcTriggered = false;
  const win = typeof window !== 'undefined' ? (window as unknown as { gc?: () => void }) : null;
  if (win && typeof win.gc === 'function') {
    try {
      win.gc();
      gcTriggered = true;
    } catch {
      gcTriggered = false;
    }
  }

  return { webllmUnloaded, compilerReset, ragUnloaded, gcTriggered };
}
