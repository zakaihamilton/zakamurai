import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getLocalPerformanceMeasures,
  markPerformance,
  measurePerformance,
  purgeSystemMemory,
} from './Performance';

vi.mock('@/components/AI/WebLLMAPI', () => ({
  unloadAllWebLLMEngines: vi.fn().mockResolvedValue(undefined),
}));

describe('Performance service', () => {
  afterEach(() => vi.restoreAllMocks());

  it('records only local Zakamurai measures', () => {
    const mark = vi.fn();
    const measure = vi.fn(() => ({ duration: 12 }));
    vi.stubGlobal('performance', {
      mark,
      measure,
      getEntriesByType: () => [
        { name: 'zakamurai:app-ready', duration: 12, startTime: 1 },
        { name: 'other', duration: 3, startTime: 0 },
      ],
    });
    markPerformance('app-ready-start');
    measurePerformance('app-ready', 'app-ready-start', 'app-ready-end');
    expect(mark).toHaveBeenCalledWith('zakamurai:app-ready-start');
    expect(measure).toHaveBeenCalledWith(
      'zakamurai:app-ready',
      'zakamurai:app-ready-start',
      'zakamurai:app-ready-end',
    );
    expect(getLocalPerformanceMeasures()).toEqual([
      { name: 'zakamurai:app-ready', duration: 12, startTime: 1 },
    ]);
  });

  it('purges system memory and invokes WebLLM unload', async () => {
    const gcMock = vi.fn();
    vi.stubGlobal('window', { gc: gcMock });

    const result = await purgeSystemMemory();
    expect(result.webllmUnloaded).toBe(true);
    expect(result.gcTriggered).toBe(true);
    expect(gcMock).toHaveBeenCalled();
  });
});
