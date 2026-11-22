import { isWebLLMGpuMemoryReserved } from '@/utils/ai-memory-governor';
import {
  CreateWebWorkerMLCEngine,
  deleteModelAllInfoInCache,
  hasModelInCache,
} from '@mlc-ai/web-llm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  askWebLLM,
  cacheWebLLMModel,
  deleteCachedWebLLMModel,
  getCachedWebLLMModelIds,
  pruneWebLLMMessages,
} from './WebLLMAPI';
import { type MockEngine, resetWebLLMTestCase, teardownWebLLMTestCase } from './WebLLMTestHelpers';
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

const mockedCreateWebWorkerMLCEngine = vi.mocked(CreateWebWorkerMLCEngine);
const mockedHasModelInCache = vi.mocked(hasModelInCache);
const mockedDeleteModelAllInfoInCache = vi.mocked(deleteModelAllInfoInCache);

describe('WebLLMAPI', () => {
  let mockEngine: MockEngine;

  beforeEach(async () => {
    mockEngine = await resetWebLLMTestCase(mockRagUnloadModel);
  });

  afterEach(() => {
    teardownWebLLMTestCase();
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

  it('supports custom messages, seeded structured output, and Qwen3 generation options', async () => {
    mockEngine.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'Custom response' } }],
    });

    const messages: WebLLMMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'user' },
    ];
    const onMetrics = vi.fn();
    const responseFormat = { type: 'json_object' as const };
    await askWebLLM('ignored', '', null, {
      model: 'Qwen3-4B-test',
      messages,
      max_tokens: 128,
      seed: 42,
      responseFormat,
      taskKind: 'answer',
      attempt: 2,
      onMetrics,
    });

    expect(mockEngine.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages,
        max_tokens: 128,
        seed: 42,
        response_format: responseFormat,
        extra_body: { enable_thinking: false },
      }),
    );
    expect(onMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        taskKind: 'answer',
        attempt: 2,
        structuredOutput: true,
      }),
    );
  });

  it('returns a fallback message when the engine response is empty', async () => {
    mockEngine.chat.completions.create.mockResolvedValue({ choices: [{ message: {} }] });
    const response = await askWebLLM('hello', '', null, { model: 'test-model' });
    expect(response).toBe('No response generated.');
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

  it('keeps a delayed system prompt at the front of the pruned history', () => {
    const pruned = pruneWebLLMMessages([
      { role: 'user', content: 'request' },
      { role: 'assistant', content: 'previous answer' },
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'latest observation' },
    ]);

    expect(pruned[0]).toEqual({ role: 'system', content: 'system prompt' });
    expect(pruned.filter((message) => message.role === 'system')).toHaveLength(1);
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
});
