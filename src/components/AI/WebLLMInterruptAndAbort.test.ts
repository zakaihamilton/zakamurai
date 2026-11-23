import { CreateWebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askWebLLM, interruptWebLLM } from './WebLLMAPI';
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

describe('WebLLMAPI — interrupts and aborts', () => {
  let mockEngine: MockEngine;

  beforeEach(async () => {
    mockEngine = await resetWebLLMTestCase(mockRagUnloadModel);
  });

  afterEach(() => {
    teardownWebLLMTestCase();
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
