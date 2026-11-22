import type { WebLLMMessage, WebLLMOptions } from '@/components/AI/types';
import {
  DEFAULT_CHUNK_IDLE_TIMEOUT_MS,
  DEFAULT_FIRST_TOKEN_TIMEOUT_MS,
  STREAM_UPDATE_INTERVAL_MS,
  abortError,
  nextWithControls,
} from './WebLLMAsyncUtils';
import { getCachedWebLLMModelIds } from './WebLLMCache';
import {
  beginActiveGeneration,
  clearEngineInterruptState,
  finishActiveGeneration,
  getEngine,
  isCurrentActiveGeneration,
} from './WebLLMEngineManager';
import type {
  AttemptResult,
  CompletionResponse,
  CompletionUsage,
  WebLLMEngine,
} from './WebLLMEngineTypes';
import { safeCallback } from './WebLLMMessageUtils';
import { WebLLMAttemptError, isAbortError } from './WebLLMRecovery';
import { runSessionCompletion } from './WebLLMSession';
import { updateWebLLMEngine } from './WebLLMState';

export const createGenerationOptions = (modelId: string, options: WebLLMOptions) => {
  const generationOptions: Record<string, unknown> = {
    temperature: options.temperature ?? 0.7,
    top_p: options.top_p ?? 0.95,
    presence_penalty: options.presence_penalty ?? 0.1,
    frequency_penalty: options.frequency_penalty ?? 0.1,
    ...(modelId.startsWith('Qwen3') ? { extra_body: { enable_thinking: false } } : {}),
  };
  if (options.max_tokens !== undefined) generationOptions.max_tokens = options.max_tokens;
  if (options.seed !== undefined) generationOptions.seed = options.seed;
  if (options.stop?.length) generationOptions.stop = options.stop;
  if (options.responseFormat) generationOptions.response_format = options.responseFormat;
  return generationOptions;
};

const runCompletion = async (
  engine: WebLLMEngine,
  modelId: string,
  messages: WebLLMMessage[],
  onUpdate: ((text: string) => void) | null,
  options: WebLLMOptions,
): Promise<Omit<AttemptResult, 'modelId' | 'initializationMs'>> => {
  const { requestId, resolveDone } = beginActiveGeneration(engine, modelId);
  updateWebLLMEngine(modelId, { generating: true, error: null });

  const startedAt = performance.now();
  let firstTokenAt: number | undefined;
  const abortListener = () => {
    void Promise.resolve(engine.interruptGenerate()).catch(() => undefined);
  };
  options.signal?.addEventListener('abort', abortListener, { once: true });

  try {
    const generationOptions = createGenerationOptions(modelId, options);
    if (!onUpdate) {
      const response = await nextWithControls(
        engine.chat.completions.create({
          messages,
          ...generationOptions,
        }),
        options.firstTokenTimeoutMs ?? DEFAULT_FIRST_TOKEN_TIMEOUT_MS,
        options.signal,
      );
      return {
        text: response.choices?.[0]?.message?.content ?? 'No response generated.',
        usage: response.usage,
        finishReason: response.choices?.[0]?.finish_reason,
        localTimeToFirstTokenMs: performance.now() - startedAt,
      };
    }

    const chunks = await nextWithControls(
      engine.chat.completions.create({
        messages,
        ...generationOptions,
        stream: true,
        stream_options: { include_usage: true },
      }),
      options.firstTokenTimeoutMs ?? DEFAULT_FIRST_TOKEN_TIMEOUT_MS,
      options.signal,
    );
    const iterator = (chunks as unknown as AsyncIterable<CompletionResponse>)[
      Symbol.asyncIterator
    ]();
    let fullText = '';
    let usage: CompletionUsage | null | undefined;
    let finishReason: string | null | undefined;
    let lastNotifiedText = '';
    let lastNotificationAt = 0;
    let pendingNotification: ReturnType<typeof setTimeout> | null = null;
    const notify = (force = false) => {
      if (fullText === lastNotifiedText) return;
      const elapsed = performance.now() - lastNotificationAt;
      if (force || lastNotificationAt === 0 || elapsed >= STREAM_UPDATE_INTERVAL_MS) {
        if (pendingNotification) clearTimeout(pendingNotification);
        pendingNotification = null;
        lastNotificationAt = performance.now();
        lastNotifiedText = fullText;
        safeCallback(onUpdate, fullText);
        return;
      }
      if (!pendingNotification) {
        pendingNotification = setTimeout(() => {
          pendingNotification = null;
          notify(true);
        }, STREAM_UPDATE_INTERVAL_MS - elapsed);
      }
    };

    try {
      let receivedContent = false;
      while (true) {
        const step = await nextWithControls(
          iterator.next(),
          receivedContent
            ? (options.chunkIdleTimeoutMs ?? DEFAULT_CHUNK_IDLE_TIMEOUT_MS)
            : (options.firstTokenTimeoutMs ?? DEFAULT_FIRST_TOKEN_TIMEOUT_MS),
          options.signal,
        );
        if (step.done) break;
        const chunk = step.value;
        usage = chunk.usage ?? usage;
        finishReason = chunk.choices?.[0]?.finish_reason ?? finishReason;
        const content = chunk.choices?.[0]?.delta?.content ?? '';
        if (!content) continue;
        if (firstTokenAt === undefined) firstTokenAt = performance.now();
        receivedContent = true;
        fullText += content;
        notify();
      }
    } finally {
      if (pendingNotification) clearTimeout(pendingNotification);
      notify(true);
    }

    return {
      text: fullText,
      usage,
      finishReason,
      localTimeToFirstTokenMs: firstTokenAt === undefined ? undefined : firstTokenAt - startedAt,
    };
  } catch (error) {
    if (isAbortError(error, options.signal)) {
      await clearEngineInterruptState(engine, modelId);
      throw abortError();
    }
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', abortListener);
    finishActiveGeneration(requestId, resolveDone, modelId);
  }
};

export const runAttempt = async (
  modelId: string,
  messages: WebLLMMessage[],
  onUpdate: ((text: string) => void) | null,
  options: WebLLMOptions,
): Promise<AttemptResult> => {
  let engineResult: Awaited<ReturnType<typeof getEngine>>;
  try {
    engineResult = await getEngine(modelId, options.onInitProgress ?? null, options, () => {
      void getCachedWebLLMModelIds();
    });
  } catch (error) {
    if (isAbortError(error, options.signal)) throw abortError();
    throw new WebLLMAttemptError('initialization', error);
  }
  try {
    const completion = options.sessionId
      ? await runSessionCompletion(
          engineResult.engine,
          modelId,
          options.sessionId,
          messages,
          onUpdate,
          options,
          {
            createGenerationOptions,
            clearEngineInterruptState: async (engine, selectedModelId) =>
              clearEngineInterruptState(engine as WebLLMEngine, selectedModelId),
            updateGenerating: (selectedModelId, generating) =>
              updateWebLLMEngine(selectedModelId, {
                generating,
                ...(generating ? { error: null } : {}),
              }),
            beginGeneration: (engine, selectedModelId) =>
              beginActiveGeneration(engine as WebLLMEngine, selectedModelId),
            finishGeneration: (generation, _engine, selectedModelId) => {
              finishActiveGeneration(generation.requestId, generation.resolveDone, selectedModelId);
            },
            isCurrentGeneration: isCurrentActiveGeneration,
            safeCallback,
            abortError: () => abortError(),
            isAbortError,
          },
        )
      : await runCompletion(engineResult.engine, modelId, messages, onUpdate, options);
    return { ...completion, modelId, initializationMs: engineResult.initializationMs };
  } catch (error) {
    if (isAbortError(error, options.signal)) throw abortError();
    throw new WebLLMAttemptError('generation', error);
  }
};
