import { CreateMLCEngine, CreateWebWorkerMLCEngine, hasModelInCache } from '@mlc-ai/web-llm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  askWebLLM,
  cacheWebLLMModel,
  deleteCachedWebLLMModel,
  getCachedWebLLMModelIds,
} from './WebLLMAPI';
import { bindWebLLMStore } from './WebLLMState';
import { type MockEngine, resetWebLLMTestCase, teardownWebLLMTestCase } from './WebLLMTestHelpers';
import type { WebLLMEngineState } from './types';

const { mockRagForceUnloadModel, mockRagUnloadModel } = vi.hoisted(() => ({
  mockRagForceUnloadModel: vi.fn(),
  mockRagUnloadModel: vi.fn().mockResolvedValue(undefined),
}));

const { mockReportDiagnostic } = vi.hoisted(() => ({
  mockReportDiagnostic: vi.fn(),
}));

vi.mock('@mlc-ai/web-llm', () => {
  return {
    CreateMLCEngine: vi.fn(),
    CreateWebWorkerMLCEngine: vi.fn(),
    deleteModelAllInfoInCache: vi.fn(),
    hasModelInCache: vi.fn(),
  };
});

vi.mock('@/utils/rag/search-utility', () => ({
  ragSearch: {
    forceUnloadModel: mockRagForceUnloadModel,
    unloadModel: mockRagUnloadModel,
  },
}));

vi.mock('@/components/Diagnostics/Diagnostics', () => ({
  reportDiagnostic: mockReportDiagnostic,
}));

const mockedCreateMLCEngine = vi.mocked(CreateMLCEngine);
const mockedCreateWebWorkerMLCEngine = vi.mocked(CreateWebWorkerMLCEngine);
const mockedHasModelInCache = vi.mocked(hasModelInCache);

describe('WebLLMAPI — telemetry and lifecycle', () => {
  let mockEngine: MockEngine;

  beforeEach(async () => {
    mockEngine = await resetWebLLMTestCase(mockRagUnloadModel);
  });

  afterEach(() => {
    teardownWebLLMTestCase();
  });

  it('reports cache lookup failures and init progress callbacks', async () => {
    mockedHasModelInCache.mockRejectedValueOnce(new Error('cache down'));
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cached = await getCachedWebLLMModelIds();
    expect(cached).toEqual([]);
    consoleWarnSpy.mockRestore();

    const onProgress = vi.fn();
    await cacheWebLLMModel('progress-model', onProgress);
    const progressCallback =
      mockedCreateWebWorkerMLCEngine.mock.calls.at(-1)?.[2]?.initProgressCallback;
    progressCallback?.({ text: '50%' } as never);
    expect(onProgress).toHaveBeenCalledWith('50%');
  });

  it('stores numeric model initialization progress and marks the engine complete when ready', async () => {
    const draft: {
      engines: Record<string, WebLLMEngineState>;
      activeModelId: string;
    } = { engines: {}, activeModelId: '' };
    const snapshots: WebLLMEngineState[] = [];
    const store = vi.fn((producer: (value: typeof draft) => void) => {
      producer(draft);
      const engine = draft.engines['numeric-progress-model'];
      if (engine) snapshots.push({ ...engine });
    });
    bindWebLLMStore(store as never);

    await cacheWebLLMModel('numeric-progress-model');

    expect(snapshots).toContainEqual(
      expect.objectContaining({ status: 'downloading', progress: 0 }),
    );
    expect(draft.engines['numeric-progress-model']).toMatchObject({
      status: 'ready',
      progress: 1,
    });

    const progressCallback =
      mockedCreateWebWorkerMLCEngine.mock.calls.at(-1)?.[2]?.initProgressCallback;
    progressCallback?.({ progress: 0.5, text: '50%' } as never);

    expect(draft.engines['numeric-progress-model']).toMatchObject({
      status: 'downloading',
      progress: 0.5,
      progressText: '50%',
    });
  });

  it('rejects initialization when Web Workers are unavailable instead of blocking the UI thread', async () => {
    vi.stubGlobal('Worker', undefined);

    await expect(cacheWebLLMModel('main-thread-model')).rejects.toThrow(/requires Web Workers/);
    expect(mockedCreateMLCEngine).not.toHaveBeenCalled();
  });

  it('warns when unloading a cached model fails', async () => {
    mockEngine.unload = vi.fn().mockRejectedValue(new Error('unload failed'));
    await cacheWebLLMModel('unload-model');
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await deleteCachedWebLLMModel('unload-model');
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('reports usage and latency metrics without exposing prompt content', async () => {
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 4,
        extra: {
          decode_tokens_per_s: 20,
          time_to_first_token_s: 0.25,
        },
      },
    });
    const onMetrics = vi.fn();

    await askWebLLM('private prompt', '', null, {
      model: 'test-model',
      requestKind: 'agent',
      onMetrics,
    });

    expect(onMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        requestKind: 'agent',
        requestedModelId: 'test-model',
        modelId: 'test-model',
        outcome: 'success',
        promptTokens: 12,
        completionTokens: 4,
        decodeTokensPerSecond: 20,
        timeToFirstTokenMs: 250,
        finishReason: 'stop',
      }),
    );
    expect(JSON.stringify(onMetrics.mock.calls[0]?.[0])).not.toContain('private prompt');
  });

  it('isolates streaming and metrics callbacks and accepts usage-only chunks', async () => {
    const asyncIterable = {
      async *[Symbol.asyncIterator]() {
        yield { choices: [], usage: { prompt_tokens: 2 } };
        yield { choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }] };
      },
    };
    mockEngine.chat.completions.create.mockResolvedValue(asyncIterable);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      askWebLLM(
        'private prompt',
        '',
        () => {
          throw new Error('stream callback failed');
        },
        {
          model: 'test-model',
          onMetrics: () => {
            throw new Error('metrics callback failed');
          },
        },
      ),
    ).resolves.toBe('answer');

    expect(warn).toHaveBeenCalledWith('[WebLLM] Consumer callback failed:', expect.any(Error));
    warn.mockRestore();
  });

  it('returns an empty result for a stream containing usage but no content', async () => {
    mockEngine.chat.completions.create.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { choices: [], usage: { prompt_tokens: 2 } };
      },
    });
    const onUpdate = vi.fn();
    const onMetrics = vi.fn();

    await expect(
      askWebLLM('hello', '', onUpdate, { model: 'test-model', onMetrics }),
    ).resolves.toBe('');
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ promptTokens: 2, timeToFirstTokenMs: undefined }),
    );
  });

  it('records available JS heap measurements without exposing prompt content', async () => {
    const heapSamples = [100 * 1024 * 1024, 112.5 * 1024 * 1024];
    Object.defineProperty(performance, 'memory', {
      configurable: true,
      get: () => ({ usedJSHeapSize: heapSamples.shift() }),
    });
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'answer' } }],
    });
    const onMetrics = vi.fn();

    await askWebLLM('private prompt', '', null, {
      model: 'test-model',
      onMetrics,
    });

    expect(onMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        jsHeapUsedMBAtStart: 100,
        jsHeapUsedMBAtEnd: 112.5,
        jsHeapDeltaMB: 12.5,
      }),
    );
    expect(JSON.stringify(onMetrics.mock.calls[0]?.[0])).not.toContain('private prompt');
  });

  it.each([
    {
      label: 'only the starting heap sample is available',
      heapSamples: [100 * 1024 * 1024, Number.NaN],
      present: { jsHeapUsedMBAtStart: 100 },
      absent: ['jsHeapUsedMBAtEnd', 'jsHeapDeltaMB'],
    },
    {
      label: 'only the ending heap sample is available',
      heapSamples: [Number.NaN, 112.5 * 1024 * 1024],
      present: { jsHeapUsedMBAtEnd: 112.5 },
      absent: ['jsHeapUsedMBAtStart', 'jsHeapDeltaMB'],
    },
  ])('records partial heap telemetry when $label', async ({ heapSamples, present, absent }) => {
    Object.defineProperty(performance, 'memory', {
      configurable: true,
      get: () => ({ usedJSHeapSize: heapSamples.shift() }),
    });
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'answer' } }],
    });
    const onMetrics = vi.fn();

    await askWebLLM('hello', '', null, {
      model: 'test-model',
      onMetrics,
    });

    const metrics = onMetrics.mock.calls[0]?.[0];
    expect(metrics).toEqual(expect.objectContaining(present));
    for (const field of absent) expect(metrics).not.toHaveProperty(field);
  });

  it('unloads all WebLLM engines to reclaim browser RAM/GPU memory', async () => {
    const { unloadAllWebLLMEngines } = await import('./WebLLMAPI');
    mockEngine.unload = vi.fn().mockResolvedValue(undefined);
    await cacheWebLLMModel('engine-1');

    await unloadAllWebLLMEngines();
    expect(mockEngine.unload).toHaveBeenCalled();
  });

  it('unloads an idle engine after one minute', async () => {
    vi.useFakeTimers();
    mockEngine.unload = vi.fn().mockResolvedValue(undefined);
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'answer' } }],
    });

    await askWebLLM('hello', '', null, { model: 'test-model' });
    expect(mockEngine.unload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() => {
      expect(mockEngine.unload).toHaveBeenCalled();
    });
    vi.useRealTimers();
  });

  it('unloads an idle engine when the page is hidden', async () => {
    mockEngine.unload = vi.fn().mockResolvedValue(undefined);
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'answer' } }],
    });
    await askWebLLM('hello', '', null, { model: 'test-model' });
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => {
      expect(mockEngine.unload).toHaveBeenCalled();
    });
    visibility.mockRestore();
  });
});
