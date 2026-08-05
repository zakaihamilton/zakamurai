import { beforeEach, describe, expect, it, vi } from 'vitest';

const createEngine = vi.fn();
const hasModelInCache = vi.fn().mockResolvedValue(true);
const deleteModelAllInfoInCache = vi.fn();

vi.mock('@mlc-ai/web-llm', () => ({
  CreateWebWorkerMLCEngine: createEngine,
  CreateMLCEngine: createEngine,
  hasModelInCache,
  deleteModelAllInfoInCache,
}));

vi.mock('@/utils/rag/search-utility', () => ({
  ragSearch: { unloadModel: vi.fn().mockResolvedValue(undefined), forceUnloadModel: vi.fn() },
}));

vi.mock('@/components/Diagnostics/Diagnostics', () => ({ reportDiagnostic: vi.fn() }));

describe('worker-resident WebLLM sessions', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal(
      'Worker',
      vi.fn(() => ({ terminate: vi.fn() })),
    );
  });

  it('sends bootstrap context once and appends only the next delta', async () => {
    const requests: Array<{ operation: string; messages?: Array<{ content: string }> }> = [];
    const engine = {
      chat: { completions: { create: vi.fn() } },
      interruptGenerate: vi.fn(),
      resetChat: vi.fn().mockResolvedValue(undefined),
      unload: vi.fn().mockResolvedValue(undefined),
      worker: { terminate: vi.fn() },
      getPromise: vi.fn(async (message: { content: { requestMessage: string } }) => {
        requests.push(JSON.parse(message.content.requestMessage));
        return null;
      }),
      asyncGenerate: vi.fn(async function* () {
        yield { choices: [{ delta: { content: 'ok' } }] };
        yield { choices: [{ finish_reason: 'stop', delta: {} }] };
      }),
    };
    createEngine.mockResolvedValue(engine);
    const { askWebLLM, deleteCachedWebLLMModel } = await import('./WebLLMAPI');

    const first = [
      { role: 'system' as const, content: 'system' },
      { role: 'user' as const, content: 'first' },
    ];
    const second = [
      ...first,
      { role: 'assistant' as const, content: 'ok' },
      { role: 'user' as const, content: 'second' },
    ];
    await askWebLLM('', '', null, {
      model: 'session-model',
      sessionId: 'session-1',
      messages: first,
    });
    await askWebLLM('', '', null, {
      model: 'session-model',
      sessionId: 'session-1',
      messages: second,
    });

    expect(requests.map((request) => request.operation)).toEqual(['start', 'append']);
    expect(requests[0].messages).toHaveLength(2);
    expect(requests[1].messages).toEqual([{ role: 'user', content: 'second' }]);
    await deleteCachedWebLLMModel('session-model');
  });

  it('filters malformed recovery entries before they reach the worker session', async () => {
    const requests: Array<{
      operation: string;
      messages?: Array<{ role: string; content: string }>;
    }> = [];
    const engine = {
      chat: { completions: { create: vi.fn() } },
      interruptGenerate: vi.fn(),
      resetChat: vi.fn().mockResolvedValue(undefined),
      unload: vi.fn().mockResolvedValue(undefined),
      worker: { terminate: vi.fn() },
      getPromise: vi.fn(async (message: { content: { requestMessage: string } }) => {
        requests.push(JSON.parse(message.content.requestMessage));
        return null;
      }),
      asyncGenerate: vi.fn(async function* () {
        yield { choices: [{ delta: { content: 'ok' } }] };
        yield { choices: [{ finish_reason: 'stop', delta: {} }] };
      }),
    };
    createEngine.mockResolvedValue(engine);
    const { askWebLLM, deleteCachedWebLLMModel } = await import('./WebLLMAPI');

    await askWebLLM('', '', null, {
      model: 'session-model',
      sessionId: 'malformed-session',
      messages: [
        { role: 'system', content: 'system' },
        undefined as never,
        { role: 'user', content: 'request' },
      ],
    });

    expect(requests[0].messages).toEqual([
      { role: 'system', content: 'system' },
      { role: 'user', content: 'request' },
    ]);
    await deleteCachedWebLLMModel('session-model');
  });

  it('moves a delayed system prompt back to the first position', async () => {
    const requests: Array<{
      operation: string;
      messages?: Array<{ role: string; content: string }>;
    }> = [];
    const engine = {
      chat: { completions: { create: vi.fn() } },
      interruptGenerate: vi.fn(),
      resetChat: vi.fn().mockResolvedValue(undefined),
      unload: vi.fn().mockResolvedValue(undefined),
      worker: { terminate: vi.fn() },
      getPromise: vi.fn(async (message: { content: { requestMessage: string } }) => {
        requests.push(JSON.parse(message.content.requestMessage));
        return null;
      }),
      asyncGenerate: vi.fn(async function* () {
        yield { choices: [{ delta: { content: 'ok' } }] };
        yield { choices: [{ finish_reason: 'stop', delta: {} }] };
      }),
    };
    createEngine.mockResolvedValue(engine);
    const { askWebLLM, deleteCachedWebLLMModel } = await import('./WebLLMAPI');

    await askWebLLM('', '', null, {
      model: 'session-model',
      sessionId: 'ordered-session',
      messages: [
        { role: 'user', content: 'request' },
        { role: 'system', content: 'system' },
        { role: 'assistant', content: 'previous' },
      ],
    });

    expect(requests[0].messages).toEqual([
      { role: 'system', content: 'system' },
      { role: 'user', content: 'request' },
      { role: 'assistant', content: 'previous' },
    ]);
    await deleteCachedWebLLMModel('session-model');
  });

  it('rehydrates when filtering a malformed delta shortens the prior prefix', async () => {
    const requests: Array<{ operation: string }> = [];
    const engine = {
      chat: { completions: { create: vi.fn() } },
      interruptGenerate: vi.fn(),
      resetChat: vi.fn().mockResolvedValue(undefined),
      unload: vi.fn().mockResolvedValue(undefined),
      worker: { terminate: vi.fn() },
      getPromise: vi.fn(async (message: { content: { requestMessage: string } }) => {
        requests.push(JSON.parse(message.content.requestMessage));
        return null;
      }),
      asyncGenerate: vi.fn(async function* () {
        yield { choices: [{ delta: { content: 'ok' } }] };
        yield { choices: [{ finish_reason: 'stop', delta: {} }] };
      }),
    };
    createEngine.mockResolvedValue(engine);
    const { askWebLLM, deleteCachedWebLLMModel } = await import('./WebLLMAPI');

    await askWebLLM('', '', null, {
      model: 'session-model',
      sessionId: 'shortened-session',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'first' },
      ],
    });
    await askWebLLM('', '', null, {
      model: 'session-model',
      sessionId: 'shortened-session',
      messages: [{ role: 'system', content: 'system' }, undefined as never],
    });

    expect(requests.map((request) => request.operation)).toEqual(['start', 'rehydrate']);
    await deleteCachedWebLLMModel('session-model');
  });
});
