import { isWebLLMGpuMemoryReserved } from '@/utils/ai-memory-governor';
import {
  CreateMLCEngine,
  CreateWebWorkerMLCEngine,
  deleteModelAllInfoInCache,
  hasModelInCache,
} from '@mlc-ai/web-llm';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  askWebLLM,
  cacheWebLLMModel,
  deleteCachedWebLLMModel,
  getCachedWebLLMModelIds,
  interruptWebLLM,
  pruneWebLLMMessages,
} from './WebLLMAPI';
import type { WebLLMMessage } from './types';

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

type MockEngine = {
  chat: { completions: { create: Mock } };
  interruptGenerate: Mock;
  resetChat: Mock;
  interruptSignal: boolean;
  unload?: Mock;
  worker?: { terminate?: Mock };
};

const mockedCreateMLCEngine = vi.mocked(CreateMLCEngine);
const mockedCreateWebWorkerMLCEngine = vi.mocked(CreateWebWorkerMLCEngine);
const mockedHasModelInCache = vi.mocked(hasModelInCache);
const mockedDeleteModelAllInfoInCache = vi.mocked(deleteModelAllInfoInCache);

describe('WebLLMAPI', () => {
  let mockEngine: MockEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRagUnloadModel.mockResolvedValue(undefined);
    vi.stubGlobal(
      'Worker',
      vi.fn(() => ({ terminate: vi.fn() })),
    );

    mockEngine = {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
      interruptGenerate: vi.fn(),
      resetChat: vi.fn().mockResolvedValue(undefined),
      interruptSignal: false,
    };
    mockedCreateMLCEngine.mockResolvedValue(mockEngine as never);
    mockedCreateWebWorkerMLCEngine.mockResolvedValue(mockEngine as never);
    await deleteCachedWebLLMModel('test-model');
  });

  afterEach(() => {
    Reflect.deleteProperty(performance, 'memory');
    vi.useRealTimers();
  });

  it('getCachedWebLLMModelIds returns list of cached models', async () => {
    mockedHasModelInCache.mockImplementation(async (id: string) => {
      return id.includes('Llama');
    });

    const cached = await getCachedWebLLMModelIds();
    expect(cached).toBeDefined();
  });

  it('cacheWebLLMModel initializes engine', async () => {
    await cacheWebLLMModel('test-model');
    expect(mockedCreateWebWorkerMLCEngine).toHaveBeenCalledWith(
      expect.anything(),
      'test-model',
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('askWebLLM queries the engine', async () => {
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'AI Response' } }],
    });

    const response = await askWebLLM('hello prompt', 'system prompt', null, {
      model: 'test-model',
    });

    expect(response).toBe('AI Response');
  });

  it('uses the recommended model when no model is specified', async () => {
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'default response' } }],
    });

    await expect(askWebLLM('hello')).resolves.toBe('default response');
    expect(mockedCreateWebWorkerMLCEngine).toHaveBeenCalledWith(
      expect.anything(),
      'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('rebuilds the same model when its context window changes', async () => {
    mockEngine.unload = vi.fn().mockResolvedValue(undefined);
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'response' } }],
    });

    await askWebLLM('first', '', null, {
      model: 'test-model',
      contextWindowSize: 1024,
    });
    await askWebLLM('second', '', null, {
      model: 'test-model',
      contextWindowSize: 2048,
    });

    expect(mockedCreateWebWorkerMLCEngine).toHaveBeenCalledTimes(2);
    expect(mockedCreateWebWorkerMLCEngine.mock.calls[0]?.[3]).toEqual({
      context_window_size: 1024,
    });
    expect(mockedCreateWebWorkerMLCEngine.mock.calls[1]?.[3]).toEqual({
      context_window_size: 2048,
    });
    expect(mockEngine.unload).toHaveBeenCalled();
    expect(mockRagUnloadModel).toHaveBeenCalledTimes(2);
  });

  it('reuses an existing larger context window for smaller requests', async () => {
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'response' } }],
    });

    await askWebLLM('first', '', null, {
      model: 'test-model',
      contextWindowSize: 4096,
    });
    await askWebLLM('second', '', null, {
      model: 'test-model',
      contextWindowSize: 1024,
    });

    expect(mockedCreateWebWorkerMLCEngine).toHaveBeenCalledOnce();
    expect(mockRagUnloadModel).toHaveBeenCalledOnce();
  });

  it('askWebLLM with streaming supports updates', async () => {
    const chunk1 = { choices: [{ delta: { content: 'AI ' } }] };
    const chunk2 = { choices: [{ delta: { content: 'Response' } }] };

    const asyncIterable = {
      async *[Symbol.asyncIterator]() {
        yield chunk1;
        yield chunk2;
      },
    };

    mockEngine.chat.completions.create.mockResolvedValue(asyncIterable);

    const onUpdate = vi.fn();
    const response = await askWebLLM('hello', '', onUpdate, {
      model: 'test-model',
    });

    expect(onUpdate).toHaveBeenCalledWith('AI ');
    expect(onUpdate).toHaveBeenCalledWith('AI Response');
    expect(response).toBe('AI Response');
  });

  it('deleteCachedWebLLMModel calls MLC delete functions', async () => {
    await deleteCachedWebLLMModel('test-model');
    expect(mockedDeleteModelAllInfoInCache).toHaveBeenCalledWith('test-model');
  });

  it('interruptWebLLM interrupts all active engine generations', async () => {
    // Make sure we have an engine cached by running a request
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'AI Response' } }],
    });
    await askWebLLM('hello', '', null, { model: 'test-model' });

    await interruptWebLLM();
    expect(mockEngine.interruptGenerate).not.toHaveBeenCalled();
    expect(mockEngine.resetChat).toHaveBeenCalledWith(false, 'test-model');
    expect(mockEngine.interruptSignal).toBe(false);
  });

  it('interruptWebLLM waits for in-flight generation and resets engine state', async () => {
    let resolveCreate: (value: unknown) => void = () => {};
    const createPromise = new Promise((resolve) => {
      resolveCreate = resolve;
    });
    mockEngine.chat.completions.create.mockReturnValue(createPromise);

    const generation = askWebLLM('hello', '', null, { model: 'test-model' });
    // Wait for lazy WebLLM import + engine init before interrupting.
    await vi.waitFor(() => {
      expect(mockEngine.chat.completions.create).toHaveBeenCalled();
    });

    const interruptPromise = interruptWebLLM();
    await vi.waitFor(() => {
      expect(mockEngine.interruptGenerate).toHaveBeenCalled();
    });

    resolveCreate({
      choices: [{ message: { content: 'AI Response' } }],
    });

    await expect(generation).rejects.toMatchObject({ name: 'AbortError' });
    await interruptPromise;

    expect(mockEngine.resetChat).toHaveBeenCalledWith(false, 'test-model');
    expect(mockEngine.interruptSignal).toBe(false);
  });

  it('handles error in interruptWebLLM gracefully', async () => {
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'AI Response' } }],
    });
    await askWebLLM('hello', '', null, { model: 'test-model' });

    mockEngine.interruptGenerate.mockRejectedValue(new Error('Interrupt failed'));
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await interruptWebLLM();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    mockEngine.interruptGenerate.mockResolvedValue(undefined);
    consoleWarnSpy.mockRestore();
  });

  it('maps web-llm interrupt errors to AbortError', async () => {
    mockEngine.chat.completions.create.mockRejectedValue(
      new Error('Message error should not be 0'),
    );

    await expect(askWebLLM('hello', '', null, { model: 'test-model' })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('interruptWebLLMModel interrupts a specific model generation', async () => {
    const { interruptWebLLMModel } = await import('./WebLLMAPI');
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Cache engine
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'AI Response' } }],
    });
    await askWebLLM('hello', '', null, { model: 'test-model' });

    await interruptWebLLMModel('test-model');
    expect(mockEngine.interruptGenerate).not.toHaveBeenCalled();

    // Check with no model
    await interruptWebLLMModel(null);

    // Check with non-existent model
    await interruptWebLLMModel('non-existent');

    // Check when it throws during an in-flight generation
    let resolveCreate: (value: unknown) => void = () => {};
    const createPromise = new Promise((resolve) => {
      resolveCreate = resolve;
    });
    mockEngine.chat.completions.create.mockReturnValue(createPromise);
    const generation = askWebLLM('hello', '', null, { model: 'test-model' });
    await vi.waitFor(() => {
      expect(mockEngine.chat.completions.create).toHaveBeenCalledTimes(2);
    });
    mockEngine.interruptGenerate.mockRejectedValue(new Error('Failed'));
    const interruptPromise = interruptWebLLMModel('test-model');
    resolveCreate({ choices: [{ message: { content: 'AI Response' } }] });
    await expect(generation).rejects.toMatchObject({ name: 'AbortError' });
    await interruptPromise;
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('throws AbortError when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      askWebLLM('hello', '', null, { model: 'test-model', signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('supports custom messages, max tokens, and Qwen3 generation options', async () => {
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'Custom response' } }],
    });

    const messages: WebLLMMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'user' },
    ];
    await askWebLLM('ignored', '', null, {
      model: 'Qwen3-4B-test',
      messages,
      max_tokens: 128,
    });

    expect(mockEngine.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages,
        max_tokens: 128,
        extra_body: { enable_thinking: false },
      }),
    );
  });

  it('returns a fallback message when the engine response is empty', async () => {
    mockEngine.chat.completions.create.mockResolvedValue({ choices: [{ message: {} }] });
    const response = await askWebLLM('hello', '', null, { model: 'test-model' });
    expect(response).toBe('No response generated.');
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

  it('rejects initialization when Web Workers are unavailable instead of blocking the UI thread', async () => {
    vi.stubGlobal('Worker', undefined);

    await expect(cacheWebLLMModel('main-thread-model')).rejects.toThrow(/requires Web Workers/);
    expect(mockedCreateMLCEngine).not.toHaveBeenCalled();
  });

  it('resets failed engine initialization so retries can succeed', async () => {
    mockedCreateWebWorkerMLCEngine.mockRejectedValueOnce(new Error('init failed'));
    await expect(cacheWebLLMModel('retry-model')).rejects.toThrow(/init failed/);
    mockedCreateWebWorkerMLCEngine.mockResolvedValue(mockEngine as never);
    await cacheWebLLMModel('retry-model');
    expect(mockedCreateWebWorkerMLCEngine).toHaveBeenCalledTimes(2);
  });

  it('warns when unloading a cached model fails', async () => {
    mockEngine.unload = vi.fn().mockRejectedValue(new Error('unload failed'));
    await cacheWebLLMModel('unload-model');
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await deleteCachedWebLLMModel('unload-model');
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('prunes long message histories to keep tokens within context budget', () => {
    const messages = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'initial request' },
      { role: 'assistant', content: 'a'.repeat(2000) },
      { role: 'user', content: 'b'.repeat(2000) },
      { role: 'assistant', content: 'c'.repeat(2000) },
      { role: 'user', content: 'd'.repeat(2000) },
      { role: 'assistant', content: 'latest assistant' },
      { role: 'user', content: 'latest observation' },
    ];

    const pruned = pruneWebLLMMessages(messages, 1500);
    expect(pruned[0]).toEqual({ role: 'system', content: 'system prompt' });
    expect(pruned[1]).toEqual({ role: 'user', content: 'initial request' });
    expect(pruned.at(-1)).toEqual({ role: 'user', content: 'latest observation' });
    expect(pruned.length).toBeLessThan(messages.length);
  });

  it('bounds oversized base messages while preserving their beginning and end', () => {
    const longRequest = `Request: ${'x'.repeat(6000)}\nImportant tail`;
    const pruned = pruneWebLLMMessages(
      [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: longRequest },
        { role: 'assistant', content: 'latest action' },
        { role: 'user', content: 'latest observation' },
      ],
      700,
    );
    const estimatedTokens = pruned.reduce(
      (sum, message) => sum + Math.ceil((message.content?.length || 0) / 3) + 4,
      0,
    );

    expect(estimatedTokens).toBeLessThanOrEqual(700);
    expect(pruned[1]?.content).toContain('Request:');
    expect(pruned[1]?.content).toContain('Important tail');
    expect(pruned.at(-1)?.content).toBe('latest observation');
  });

  it('handles empty and content-free context without mutating it', () => {
    const empty: WebLLMMessage[] = [];
    expect(pruneWebLLMMessages(empty, 1)).toBe(empty);
    expect(pruneWebLLMMessages([{ role: 'user' }], 1)).toEqual([{ role: 'user' }]);
    expect(pruneWebLLMMessages([{ role: 'system', content: 'brief' }], 1)).toEqual([
      { role: 'system', content: 'brief' },
    ]);
    expect(
      pruneWebLLMMessages([{ role: 'system', content: `start-${'x'.repeat(1000)}-end` }], 50)[0]
        ?.content,
    ).toContain('context truncated');
  });

  it('serializes generations so the same engine never runs two requests concurrently', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    mockEngine.chat.completions.create
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce({ choices: [{ message: { content: 'second' } }] });

    const first = askWebLLM('first', '', null, { model: 'test-model' });
    const second = askWebLLM('second', '', null, { model: 'test-model' });
    await vi.waitFor(() => {
      expect(mockEngine.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    resolveFirst({ choices: [{ message: { content: 'first' } }] });
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(mockEngine.chat.completions.create).toHaveBeenCalledTimes(2);
  });

  it('removes an aborted queued request without interrupting the active request', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    mockEngine.chat.completions.create.mockReturnValueOnce(firstResponse);
    const first = askWebLLM('first', '', null, { model: 'test-model' });
    const controller = new AbortController();
    const queued = askWebLLM('queued', '', null, {
      model: 'test-model',
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(mockEngine.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    resolveFirst({ choices: [{ message: { content: 'first' } }] });
    await expect(first).resolves.toBe('first');
    expect(mockEngine.interruptGenerate).not.toHaveBeenCalled();
    expect(mockEngine.chat.completions.create).toHaveBeenCalledTimes(1);
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

  it.each(['out of memory', 'worker terminated unexpectedly'])(
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

  it('cancels model initialization without waiting for the worker promise', async () => {
    mockedCreateWebWorkerMLCEngine.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const request = askWebLLM('hello', '', null, {
      model: 'initializing-model',
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(mockedCreateWebWorkerMLCEngine).toHaveBeenCalled();
    });

    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('cancels while waiting for RAG memory release', async () => {
    mockRagUnloadModel.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const request = askWebLLM('hello', '', null, {
      model: 'rag-blocked-model',
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(mockRagUnloadModel).toHaveBeenCalled();
    });

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockedCreateWebWorkerMLCEngine).not.toHaveBeenCalled();
  });

  it('continues initialization when RAG memory release exceeds its bound', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockRagUnloadModel.mockImplementation(() => new Promise(() => {}));
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'answer' } }],
    });

    const request = askWebLLM('hello', '', null, { model: 'rag-timeout-model' });
    await vi.advanceTimersByTimeAsync(12_000);

    await expect(request).resolves.toBe('answer');
    expect(warn).toHaveBeenCalledWith(
      '[WebLLM] Failed to release RAG inference memory:',
      expect.objectContaining({ message: expect.stringContaining('Timed out') }),
    );
    expect(mockRagForceUnloadModel).toHaveBeenCalledOnce();
    warn.mockRestore();
    vi.useRealTimers();
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

  it('sustains a mixed completion and agent lifecycle without reload churn', async () => {
    const { unloadAllWebLLMEngines } = await import('./WebLLMAPI');
    mockEngine.unload = vi.fn().mockResolvedValue(undefined);
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'answer' } }],
    });

    for (let index = 0; index < 200; index++) {
      const isAgentRequest = index % 10 === 0;
      await askWebLLM(`soak-${index}`, '', null, {
        model: 'test-model',
        requestKind: isAgentRequest ? 'agent' : 'completion',
        contextWindowSize: isAgentRequest ? 4096 : 1024,
        max_tokens: isAgentRequest ? 512 : 64,
      });
    }

    expect(mockedCreateWebWorkerMLCEngine).toHaveBeenCalledOnce();
    expect(mockRagUnloadModel).toHaveBeenCalledOnce();
    expect(mockEngine.chat.completions.create).toHaveBeenCalledTimes(200);
    expect(isWebLLMGpuMemoryReserved()).toBe(true);

    await unloadAllWebLLMEngines();

    expect(mockEngine.unload).toHaveBeenCalledOnce();
    expect(isWebLLMGpuMemoryReserved()).toBe(false);
  });

  it('reports reset failures while interrupting an idle engine', async () => {
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'answer' } }],
    });
    await askWebLLM('hello', '', null, { model: 'test-model' });
    mockEngine.resetChat.mockRejectedValue(new Error('reset failed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { interruptWebLLMModel } = await import('./WebLLMAPI');

    await interruptWebLLMModel('test-model');
    await interruptWebLLM();

    expect(warn).toHaveBeenCalledWith(
      'Failed to reset WebLLM chat state for test-model:',
      expect.any(Error),
    );
    warn.mockRestore();
  });

  it('does not interrupt a different model that is currently generating', async () => {
    let resolveCreate: (value: unknown) => void = () => {};
    mockEngine.chat.completions.create.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const request = askWebLLM('hello', '', null, { model: 'test-model' });
    await vi.waitFor(() => {
      expect(mockEngine.chat.completions.create).toHaveBeenCalled();
    });
    const { interruptWebLLMModel } = await import('./WebLLMAPI');

    await interruptWebLLMModel('different-model');
    expect(mockEngine.interruptGenerate).not.toHaveBeenCalled();
    resolveCreate({ choices: [{ message: { content: 'answer' } }] });
    await expect(request).resolves.toBe('answer');
  });
});
