import type { WebLLMGenerationMetrics, WebLLMMessage, WebLLMOptions } from '@/components/AI/types';
import { ensureSystemMessageFirst } from './WebLLMMessageUtils';

type CompletionUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  extra?: { decode_tokens_per_s?: number; time_to_first_token_s?: number };
};

type CompletionChunk = {
  usage?: CompletionUsage | null;
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
};

export type SessionEngine = {
  interruptGenerate: () => void | Promise<void>;
  asyncGenerate?: (selectedModelId: string) => AsyncGenerator<CompletionChunk, void, void>;
  getPromise?: (message: unknown) => Promise<unknown>;
};

export type SessionAttemptResult = {
  text: string;
  usage?: CompletionUsage | null;
  finishReason?: string | null;
  localTimeToFirstTokenMs?: number;
  sessionState?: WebLLMGenerationMetrics['sessionState'];
  submittedDeltaBytes?: number;
  submittedDeltaTokens?: number;
  reusedContextTokens?: number;
};

type SessionHistory = {
  modelId: string;
  messages: WebLLMMessage[];
  sourceMessages: WebLLMMessage[];
};

type Runtime = {
  createGenerationOptions: (modelId: string, options: WebLLMOptions) => Record<string, unknown>;
  clearEngineInterruptState: (engine: SessionEngine, modelId: string) => Promise<void>;
  updateGenerating: (modelId: string, generating: boolean) => void;
  beginGeneration: (
    engine: SessionEngine,
    modelId: string,
  ) => {
    requestId: number;
    resolveDone: () => void;
  };
  finishGeneration: (
    generation: { requestId: number; resolveDone: () => void },
    engine: SessionEngine,
    modelId: string,
  ) => void;
  isCurrentGeneration: (requestId: number) => boolean;
  safeCallback: <T>(callback: ((value: T) => void) | null | undefined, value: T) => void;
  abortError: () => DOMException;
  isAbortError: (error: unknown, signal?: AbortSignal) => boolean;
};

const histories = new Map<string, SessionHistory>();

export const clearSessionHistories = (): void => histories.clear();

/**
 * Keep malformed recovery payloads from reaching WebLLM. Action-loop recovery
 * is intentionally tolerant of model output, but the native chat formatter
 * assumes every entry has a role and string content. Filtering at the session
 * boundary makes that assumption explicit and keeps a bad delta from
 * poisoning the resident conversation.
 */
const normalizeMessages = (messages: WebLLMMessage[] | null | undefined): WebLLMMessage[] =>
  ensureSystemMessageFirst(
    (Array.isArray(messages) ? messages : []).filter(
      (message): message is WebLLMMessage =>
        Boolean(message) &&
        (message.role === 'system' || message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string',
    ),
  );

const estimateTokens = (messages: WebLLMMessage[]): number =>
  messages.reduce((total, message) => total + Math.ceil(message.content.length / 3) + 4, 0);

const sameMessage = (left: WebLLMMessage, right: WebLLMMessage | undefined): boolean =>
  Boolean(right) && left.role === right?.role && left.content === right?.content;

const requestSession = async (
  engine: SessionEngine,
  request: Record<string, unknown>,
): Promise<void> => {
  if (!engine.getPromise) throw new Error('Worker session transport is unavailable.');
  await engine.getPromise({
    kind: 'customRequest',
    uuid: crypto.randomUUID(),
    content: { requestName: 'agent-session', requestMessage: JSON.stringify(request) },
  });
};

export const runSessionCompletion = async (
  engine: SessionEngine,
  modelId: string,
  sessionId: string,
  messages: WebLLMMessage[],
  onUpdate: ((text: string) => void) | null,
  options: WebLLMOptions,
  runtime: Runtime,
): Promise<SessionAttemptResult> => {
  if (!engine.asyncGenerate) throw new Error('Worker session streaming is unavailable.');
  const normalizedMessages = normalizeMessages(messages);
  if (!normalizedMessages.length) throw new Error('Agent session received no valid messages.');
  const previous = histories.get(sessionId);
  const sourceMessages = previous?.sourceMessages || previous?.messages || [];
  const canAppend =
    previous?.modelId === modelId &&
    Boolean(sourceMessages.length) &&
    sourceMessages.length <= normalizedMessages.length &&
    sourceMessages.every((message, index) => sameMessage(message, normalizedMessages[index]));
  const delta = canAppend ? normalizedMessages.slice(sourceMessages.length) : normalizedMessages;
  const inputBudget = Math.max(
    256,
    (options.contextWindowSize ?? 4096) - (options.max_tokens ?? 1200) - 128,
  );
  const shouldCompact = canAppend && estimateTokens(previous?.messages || []) > inputBudget * 0.7;
  const compactMessages = shouldCompact
    ? [
        normalizedMessages[0],
        {
          role: 'user' as const,
          content: `Context checkpoint. Preserve the original request and recent decisions:\n${normalizedMessages
            .slice(1, -6)
            .map((message) => `${message.role}: ${message.content}`)
            .join('\n')
            .slice(-4200)}`,
        },
        ...normalizedMessages.slice(-6),
      ].filter((message): message is WebLLMMessage => Boolean(message))
    : delta;
  const outgoingMessages = shouldCompact ? compactMessages : delta;
  const operation = shouldCompact
    ? 'rehydrate'
    : canAppend
      ? 'append'
      : previous
        ? 'rehydrate'
        : 'start';
  if (!outgoingMessages.length)
    throw new Error('Agent session received no new message; rehydration is required.');

  const generation = runtime.beginGeneration(engine, modelId);
  runtime.updateGenerating(modelId, true);
  const startedAt = performance.now();
  let firstTokenAt: number | undefined;
  let fullText = '';
  let usage: CompletionUsage | null | undefined;
  let finishReason: string | null | undefined;
  const abortListener = () => {
    void Promise.resolve(engine.interruptGenerate()).catch(() => undefined);
  };
  options.signal?.addEventListener('abort', abortListener, { once: true });
  try {
    await requestSession(engine, {
      operation,
      sessionId,
      messages: outgoingMessages,
      modelId: [modelId],
      generation: {
        ...runtime.createGenerationOptions(modelId, options),
        stream_options: { include_usage: true },
      },
    });
    for await (const chunk of engine.asyncGenerate(sessionId)) {
      if (options.signal?.aborted) throw runtime.abortError();
      usage = chunk.usage ?? usage;
      finishReason = chunk.choices?.[0]?.finish_reason ?? finishReason;
      const content = chunk.choices?.[0]?.delta?.content ?? '';
      if (!content) continue;
      if (firstTokenAt === undefined) firstTokenAt = performance.now();
      fullText += content;
      runtime.safeCallback(onUpdate, fullText);
    }
    const nextMessages = [...normalizedMessages, { role: 'assistant' as const, content: fullText }];
    const workerBase = shouldCompact
      ? compactMessages
      : canAppend
        ? [...(previous?.messages || []), ...outgoingMessages]
        : outgoingMessages;
    histories.set(sessionId, {
      modelId,
      messages: [...workerBase, { role: 'assistant' as const, content: fullText }],
      sourceMessages: nextMessages,
    });
    return {
      text: fullText || 'No response generated.',
      usage,
      finishReason,
      localTimeToFirstTokenMs: firstTokenAt === undefined ? undefined : firstTokenAt - startedAt,
      sessionState: shouldCompact
        ? 'compacted'
        : operation === 'start'
          ? 'cold-start'
          : operation === 'rehydrate'
            ? 'rehydrated'
            : 'hit',
      submittedDeltaBytes: JSON.stringify(outgoingMessages).length,
      submittedDeltaTokens: estimateTokens(outgoingMessages),
      reusedContextTokens: canAppend ? estimateTokens(previous?.messages || []) : 0,
    };
  } catch (error) {
    histories.delete(sessionId);
    if (runtime.isAbortError(error, options.signal)) {
      await runtime.clearEngineInterruptState(engine, modelId);
      throw runtime.abortError();
    }
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', abortListener);
    if (runtime.isCurrentGeneration(generation.requestId)) {
      runtime.finishGeneration(generation, engine, modelId);
    }
    runtime.updateGenerating(modelId, false);
  }
};
