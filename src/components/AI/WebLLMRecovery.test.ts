import { CreateWebWorkerMLCEngine, hasModelInCache } from '@mlc-ai/web-llm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askWebLLM, cacheWebLLMModel, deleteCachedWebLLMModel } from './WebLLMAPI';
import { type MockEngine, resetWebLLMTestCase, teardownWebLLMTestCase } from './WebLLMTestHelpers';

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

const mockedCreateWebWorkerMLCEngine = vi.mocked(CreateWebWorkerMLCEngine);
const mockedHasModelInCache = vi.mocked(hasModelInCache);

describe('WebLLMAPI — recovery and fallbacks', () => {
  let mockEngine: MockEngine;

  beforeEach(async () => {
    mockEngine = await resetWebLLMTestCase(mockRagUnloadModel);
  });

  afterEach(() => {
    teardownWebLLMTestCase();
  });

  it('wraps non-abort failures in a Local AI failed error', async () => {
    mockEngine.chat.completions.create.mockRejectedValue(new Error('boom'));
    await expect(askWebLLM('hello', '', null, { model: 'test-model' })).rejects.toThrow(
      /Local AI failed/,
    );
    const failureDiagnostic = mockReportDiagnostic.mock.calls.find(
      ([event]) => event?.message === 'Local AI request failed',
    )?.[0];
    expect(failureDiagnostic).toEqual(
      expect.objectContaining({
        source: 'webllm',
        severity: 'error',
        message: 'Local AI request failed',
        details: expect.stringContaining('errorMessageLength'),
      }),
    );
    expect(failureDiagnostic?.details).toContain('errorMessageFingerprint');
    expect(failureDiagnostic?.details).not.toContain('boom');
  });

  it('resets failed engine initialization so retries can succeed', async () => {
    mockedCreateWebWorkerMLCEngine.mockRejectedValueOnce(new Error('init failed'));
    await expect(cacheWebLLMModel('retry-model')).rejects.toThrow(/init failed/);
    mockedCreateWebWorkerMLCEngine.mockResolvedValue(mockEngine as never);
    await cacheWebLLMModel('retry-model');
    expect(mockedCreateWebWorkerMLCEngine).toHaveBeenCalledTimes(2);
  });

  it('retries transient Cache.add network failures during an AI request', async () => {
    mockedCreateWebWorkerMLCEngine.mockRejectedValueOnce(
      new Error(
        "NetworkError: Failed to execute 'add' on 'Cache': Cache.add() encountered a network error",
      ),
    );
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'recovered response' } }],
    });

    await expect(askWebLLM('hello', '', null, { model: 'retry-network-model' })).resolves.toBe(
      'recovered response',
    );

    expect(mockedCreateWebWorkerMLCEngine).toHaveBeenCalledTimes(2);
  });

  it('retries a recoverable failure once and then uses the closest smaller cached model', async () => {
    const selected = 'Qwen3.5-4B-q4f16_1-MLC';
    const fallback = 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC';
    mockedHasModelInCache.mockImplementation(async (modelId: string) => modelId === fallback);
    mockEngine.chat.completions.create
      .mockRejectedValueOnce(new Error('WebGPU device lost: out of memory'))
      .mockRejectedValueOnce(new Error('WebGPU device lost: out of memory'))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'fallback response' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'remembered response' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'selected response' } }] });
    const onRecovery = vi.fn();

    await expect(askWebLLM('hello', '', null, { model: selected, onRecovery })).resolves.toBe(
      'fallback response',
    );
    expect(onRecovery.mock.calls.map(([event]) => event.action)).toEqual(['retry', 'fallback']);
    expect(onRecovery.mock.calls.at(-1)?.[0]).toMatchObject({ modelId: fallback });

    onRecovery.mockClear();
    await expect(askWebLLM('again', '', null, { model: selected, onRecovery })).resolves.toBe(
      'remembered response',
    );
    expect(onRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reuse-fallback', modelId: fallback }),
    );

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockedHasModelInCache.mockRejectedValueOnce(new Error('cache unavailable'));
    await expect(askWebLLM('after cache failure', '', null, { model: selected })).resolves.toBe(
      'selected response',
    );
    expect(warn).toHaveBeenCalledWith(
      '[WebLLM] Failed to verify remembered fallback:',
      expect.any(Error),
    );
    warn.mockRestore();

    await deleteCachedWebLLMModel(selected);
    const { unloadAllWebLLMEngines } = await import('./WebLLMAPI');
    await unloadAllWebLLMEngines();
  });

  it.each(['worker terminated unexpectedly'])(
    'classifies and retries a recoverable "%s" failure',
    async (failure) => {
      mockEngine.chat.completions.create
        .mockRejectedValueOnce(new Error(failure))
        .mockResolvedValueOnce({ choices: [{ message: { content: 'recovered' } }] });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(
        askWebLLM('hello', '', null, {
          model: 'test-model',
          onRecovery: () => {
            throw new Error('consumer failed');
          },
        }),
      ).resolves.toBe('recovered');

      expect(mockEngine.chat.completions.create).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledWith('[WebLLM] Consumer callback failed:', expect.any(Error));
      warn.mockRestore();
    },
  );

  it('rebuilds canonical context without changing models after invalid context', async () => {
    mockEngine.chat.completions.create
      .mockRejectedValueOnce(new Error('SystemMessageOrderError'))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'recovered' } }] });

    await expect(askWebLLM('hello', '', null, { model: 'test-model' })).resolves.toBe('recovered');

    expect(mockedCreateWebWorkerMLCEngine).toHaveBeenCalledTimes(1);
    expect(mockEngine.chat.completions.create).toHaveBeenCalledTimes(2);
  });

  it('moves directly to a cached smaller model after out of memory', async () => {
    const selected = 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC';
    const fallback = 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC';
    mockEngine.chat.completions.create
      .mockRejectedValueOnce(new Error('out of memory'))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'recovered' } }] });
    mockedHasModelInCache.mockImplementation(async (modelId: string) => modelId === fallback);
    const recoveries: string[] = [];

    await expect(
      askWebLLM('hello', '', null, {
        model: selected,
        onRecovery: (event) => recoveries.push(`${event.action}:${event.modelId}`),
      }),
    ).resolves.toBe('recovered');

    expect(mockEngine.chat.completions.create).toHaveBeenCalledTimes(2);
    expect(recoveries).toContain(`fallback:${fallback}`);
  });

  it('recovers when a worker rejects with a non-Error value', async () => {
    mockEngine.chat.completions.create
      .mockRejectedValueOnce('worker terminated unexpectedly')
      .mockResolvedValueOnce({ choices: [{ message: { content: 'recovered' } }] });

    await expect(askWebLLM('hello', '', null, { model: 'test-model' })).resolves.toBe('recovered');
  });

  it('stops after a retry produces a non-recoverable error', async () => {
    mockEngine.chat.completions.create
      .mockRejectedValueOnce(new Error('worker terminated unexpectedly'))
      .mockRejectedValueOnce(new Error('invalid response_format'));

    await expect(askWebLLM('hello', '', null, { model: 'test-model' })).rejects.toThrow(
      /invalid response_format/,
    );
    expect(mockEngine.chat.completions.create).toHaveBeenCalledTimes(2);
  });

  it('aborts while a retried generation is in flight', async () => {
    mockEngine.chat.completions.create
      .mockRejectedValueOnce(new Error('worker terminated unexpectedly'))
      .mockReturnValueOnce(new Promise(() => {}));
    const controller = new AbortController();
    const request = askWebLLM('hello', '', null, {
      model: 'test-model',
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(mockEngine.chat.completions.create).toHaveBeenCalledTimes(2);
    });

    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not retry non-recoverable request errors', async () => {
    mockEngine.chat.completions.create.mockRejectedValue(new Error('invalid response_format'));

    await expect(askWebLLM('hello', '', null, { model: 'test-model' })).rejects.toThrow(
      /invalid response_format/,
    );
    expect(mockEngine.chat.completions.create).toHaveBeenCalledOnce();
  });

  it('retries once when generation stalls, then surfaces the timeout', async () => {
    mockEngine.chat.completions.create.mockImplementation(() => new Promise(() => {}));
    mockedHasModelInCache.mockResolvedValue(false);

    await expect(
      askWebLLM('hello', '', null, {
        model: 'Qwen3.5-0.8B-q4f16_1-MLC',
        firstTokenTimeoutMs: 5,
      }),
    ).rejects.toThrow(/generation stopped making progress/);
    expect(mockEngine.chat.completions.create).toHaveBeenCalledTimes(2);
  });

  it('rebuilds once after an initialization progress stall', async () => {
    mockedCreateWebWorkerMLCEngine.mockImplementation(() => new Promise(() => {}));
    mockedHasModelInCache.mockResolvedValue(false);

    await expect(
      askWebLLM('hello', '', null, {
        model: 'Qwen3.5-0.8B-q4f16_1-MLC',
        initStallTimeoutMs: 5,
      }),
    ).rejects.toThrow(/stopped making progress/);
    expect(mockedCreateWebWorkerMLCEngine).toHaveBeenCalledTimes(2);
  });
});
