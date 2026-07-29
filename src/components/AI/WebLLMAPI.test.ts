import { CreateMLCEngine, deleteModelAllInfoInCache, hasModelInCache } from '@mlc-ai/web-llm';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  askWebLLM,
  cacheWebLLMModel,
  deleteCachedWebLLMModel,
  getCachedWebLLMModelIds,
  interruptWebLLM,
  pruneWebLLMMessages,
} from './WebLLMAPI';
import type { WebLLMMessage } from './types';

vi.mock('@mlc-ai/web-llm', () => {
  return {
    CreateMLCEngine: vi.fn(),
    deleteModelAllInfoInCache: vi.fn(),
    hasModelInCache: vi.fn(),
  };
});

type MockEngine = {
  chat: { completions: { create: Mock } };
  interruptGenerate: Mock;
  resetChat: Mock;
  interruptSignal: boolean;
  unload?: Mock;
};

const mockedCreateMLCEngine = vi.mocked(CreateMLCEngine);
const mockedHasModelInCache = vi.mocked(hasModelInCache);
const mockedDeleteModelAllInfoInCache = vi.mocked(deleteModelAllInfoInCache);

describe('WebLLMAPI', () => {
  let mockEngine: MockEngine;

  beforeEach(async () => {
    vi.clearAllMocks();

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
    await deleteCachedWebLLMModel('test-model');
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
    expect(mockedCreateMLCEngine).toHaveBeenCalledWith(
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

    await generation;
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
      expect(mockEngine.chat.completions.create).toHaveBeenCalled();
    });
    mockEngine.interruptGenerate.mockRejectedValue(new Error('Failed'));
    const interruptPromise = interruptWebLLMModel('test-model');
    resolveCreate({ choices: [{ message: { content: 'AI Response' } }] });
    await generation;
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
  });

  it('reports cache lookup failures and init progress callbacks', async () => {
    mockedHasModelInCache.mockRejectedValueOnce(new Error('cache down'));
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cached = await getCachedWebLLMModelIds();
    expect(cached).toEqual([]);
    consoleWarnSpy.mockRestore();

    const onProgress = vi.fn();
    await cacheWebLLMModel('progress-model', onProgress);
    const progressCallback = mockedCreateMLCEngine.mock.calls.at(-1)?.[1]?.initProgressCallback;
    progressCallback?.({ text: '50%' } as never);
    expect(onProgress).toHaveBeenCalledWith('50%');
  });

  it('resets failed engine initialization so retries can succeed', async () => {
    mockedCreateMLCEngine.mockRejectedValueOnce(new Error('init failed'));
    await expect(cacheWebLLMModel('retry-model')).rejects.toThrow(/init failed/);
    mockedCreateMLCEngine.mockResolvedValue(mockEngine as never);
    await cacheWebLLMModel('retry-model');
    expect(mockedCreateMLCEngine).toHaveBeenCalledTimes(2);
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

  it('unloads all WebLLM engines to reclaim browser RAM/GPU memory', async () => {
    const { unloadAllWebLLMEngines } = await import('./WebLLMAPI');
    mockEngine.unload = vi.fn().mockResolvedValue(undefined);
    await cacheWebLLMModel('engine-1');

    await unloadAllWebLLMEngines();
    expect(mockEngine.unload).toHaveBeenCalled();
  });
});
