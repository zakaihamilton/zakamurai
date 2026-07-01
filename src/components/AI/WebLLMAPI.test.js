import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getCachedWebLLMModelIds,
  cacheWebLLMModel,
  deleteCachedWebLLMModel,
  askWebLLM,
  interruptWebLLM,
} from './WebLLMAPI';
import { CreateMLCEngine, deleteModelAllInfoInCache, hasModelInCache } from '@mlc-ai/web-llm';

vi.mock('@mlc-ai/web-llm', () => {
  return {
    CreateMLCEngine: vi.fn(),
    deleteModelAllInfoInCache: vi.fn(),
    hasModelInCache: vi.fn(),
  };
});

describe('WebLLMAPI', () => {
  let mockEngine;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockEngine = {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
      interruptGenerate: vi.fn(),
    };
    CreateMLCEngine.mockResolvedValue(mockEngine);
    await deleteCachedWebLLMModel('test-model');
  });

  it('getCachedWebLLMModelIds returns list of cached models', async () => {
    hasModelInCache.mockImplementation(async (id) => {
      return id.includes('Llama');
    });

    const cached = await getCachedWebLLMModelIds();
    expect(cached).toBeDefined();
  });

  it('cacheWebLLMModel initializes engine', async () => {
    await cacheWebLLMModel('test-model');
    expect(CreateMLCEngine).toHaveBeenCalledWith(
      'test-model',
      expect.any(Object),
      expect.any(Object)
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
    expect(deleteModelAllInfoInCache).toHaveBeenCalledWith('test-model');
  });

  it('interruptWebLLM interrupts all active engine generations', async () => {
    // Make sure we have an engine cached by running a request
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'AI Response' } }],
    });
    await askWebLLM('hello', '', null, { model: 'test-model' });

    await interruptWebLLM();
    expect(mockEngine.interruptGenerate).toHaveBeenCalled();
  });

  it('handles error in interruptWebLLM gracefully', async () => {
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'AI Response' } }],
    });
    await askWebLLM('hello', '', null, { model: 'test-model' });

    mockEngine.interruptGenerate.mockRejectedValue(new Error('Interrupt failed'));
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await interruptWebLLM();
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('interruptWebLLMModel interrupts a specific model generation', async () => {
    const { interruptWebLLMModel } = await import('./WebLLMAPI');
    
    // Cache engine
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'AI Response' } }],
    });
    await askWebLLM('hello', '', null, { model: 'test-model' });

    await interruptWebLLMModel('test-model');
    expect(mockEngine.interruptGenerate).toHaveBeenCalled();

    // Check with no model
    await interruptWebLLMModel(null);

    // Check with non-existent model
    await interruptWebLLMModel('non-existent');

    // Check when it throws
    mockEngine.interruptGenerate.mockRejectedValue(new Error('Failed'));
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await interruptWebLLMModel('test-model');
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });
});
