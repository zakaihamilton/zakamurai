import type { WebLLMMessage, WebLLMOptions } from '@/components/AI/types';
import { DEFAULT_SYSTEM_PROMPT } from './Prompts';
import {
  CONTEXT_SAFETY_TOKENS,
  DEFAULT_CONTEXT_WINDOW_SIZE,
  abortError,
  enqueueGeneration,
  throwIfAborted,
} from './WebLLMAsyncUtils';
import { clearAllSessionFallbacks } from './WebLLMCache';
import {
  clearIdleUnloadTimer,
  disposeCurrentEngine,
  interruptAllRequestsAndEngine,
  interruptModelRequestsAndEngine,
  registerPendingRequest,
  resetIdleUnloadState,
  scheduleIdleEngineUnload,
  unregisterPendingRequest,
} from './WebLLMEngineManager';
import {
  emitFailureDiagnostic,
  emitMetrics,
  ensureSystemMessageFirst,
  errorFingerprint,
  pruneWebLLMMessages,
  readUsedJSHeapMB,
  safeCallback,
} from './WebLLMMessageUtils';
import { getDeviceAppropriateDefaultModelId } from './WebLLMModels';
import {
  WebLLMAttemptError,
  errorMessage,
  isAbortError,
  unwrapAttemptError,
} from './WebLLMRecovery';
import { clearModelCircuitBreakers } from './WebLLMReliabilityState';
import { executeWithRecovery } from './WebLLMRetryExecutor';

export {
  cacheWebLLMModel,
  deleteCachedWebLLMModel,
  getCachedWebLLMModelIds,
} from './WebLLMCache';
export { pruneWebLLMMessages } from './WebLLMMessageUtils';
export { RECOMMENDED_WEB_LLM_MODEL, WEB_LLM_MODELS } from './WebLLMModels';

export const askWebLLM = async (
  prompt: string,
  systemPrompt = '',
  onUpdate: ((text: string) => void) | null = null,
  options: WebLLMOptions = {},
): Promise<string> => {
  clearIdleUnloadTimer();
  const requestedModelId = options.model || getDeviceAppropriateDefaultModelId();
  const startedAt = Date.now();
  const jsHeapUsedMBAtStart = readUsedJSHeapMB();
  const heapMetrics = () => {
    const jsHeapUsedMBAtEnd = readUsedJSHeapMB();
    return {
      ...(jsHeapUsedMBAtStart !== undefined ? { jsHeapUsedMBAtStart } : {}),
      ...(jsHeapUsedMBAtEnd !== undefined ? { jsHeapUsedMBAtEnd } : {}),
      ...(jsHeapUsedMBAtStart !== undefined && jsHeapUsedMBAtEnd !== undefined
        ? {
            jsHeapDeltaMB: Math.round((jsHeapUsedMBAtEnd - jsHeapUsedMBAtStart) * 100) / 100,
          }
        : {}),
    };
  };
  let actualModelId = requestedModelId;
  let recoveryCount = 0;
  let initializationMs: number | undefined;
  const requestController = new AbortController();
  const forwardAbort = () => requestController.abort();
  options.signal?.addEventListener('abort', forwardAbort, { once: true });
  if (options.signal?.aborted) requestController.abort();
  const requestOptions: WebLLMOptions = {
    ...options,
    signal: requestController.signal,
    onRecovery: (event) => {
      actualModelId = event.modelId;
      recoveryCount = event.attempt;
      safeCallback(options.onRecovery, event);
    },
  };
  const pendingRequestId = registerPendingRequest(requestedModelId, requestController);
  try {
    throwIfAborted(requestOptions.signal);
    const rawMessages = requestOptions.messages || [
      { role: 'system', content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];
    const inputBudget = Math.max(
      256,
      (requestOptions.contextWindowSize ?? DEFAULT_CONTEXT_WINDOW_SIZE) -
        (requestOptions.max_tokens ?? 1200) -
        CONTEXT_SAFETY_TOKENS,
    );
    const orderedMessages = ensureSystemMessageFirst(
      pruneWebLLMMessages(rawMessages, inputBudget),
    ) as WebLLMMessage[];
    const messages =
      orderedMessages[0]?.role === 'system'
        ? orderedMessages
        : [
            { role: 'system' as const, content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
            ...orderedMessages,
          ];
    const execution = await enqueueGeneration(requestOptions.signal, () =>
      executeWithRecovery(requestedModelId, messages, onUpdate, requestOptions),
    );
    const result = execution.result;
    actualModelId = result.modelId;
    recoveryCount = execution.recoveryCount;
    initializationMs = result.initializationMs;
    emitMetrics(requestOptions, {
      requestKind: requestOptions.requestKind || 'general',
      requestedModelId,
      modelId: actualModelId,
      outcome: 'success',
      startedAt,
      totalMs: Date.now() - startedAt,
      ...(initializationMs !== undefined ? { initializationMs } : {}),
      timeToFirstTokenMs:
        result.usage?.extra?.time_to_first_token_s !== undefined
          ? result.usage.extra.time_to_first_token_s * 1000
          : result.localTimeToFirstTokenMs,
      promptTokens: result.usage?.prompt_tokens,
      completionTokens: result.usage?.completion_tokens,
      decodeTokensPerSecond: result.usage?.extra?.decode_tokens_per_s,
      finishReason: result.finishReason,
      recoveryCount,
      sessionState: result.sessionState,
      submittedDeltaBytes: result.submittedDeltaBytes,
      submittedDeltaTokens: result.submittedDeltaTokens,
      reusedContextTokens: result.reusedContextTokens,
      taskKind: requestOptions.taskKind,
      attempt: requestOptions.attempt,
      structuredOutput: Boolean(requestOptions.responseFormat),
      ...heapMetrics(),
    });
    return result.text;
  } catch (error) {
    const aborted = isAbortError(error, requestOptions.signal);
    const unwrapped = unwrapAttemptError(error);
    const failurePhase = error instanceof WebLLMAttemptError ? error.phase : undefined;
    const failureDetails = unwrapped as { name?: unknown; message?: unknown };
    emitMetrics(requestOptions, {
      requestKind: requestOptions.requestKind || 'general',
      requestedModelId,
      modelId: actualModelId,
      outcome: aborted ? 'aborted' : 'error',
      startedAt,
      totalMs: Date.now() - startedAt,
      recoveryCount,
      taskKind: requestOptions.taskKind,
      attempt: requestOptions.attempt,
      structuredOutput: Boolean(requestOptions.responseFormat),
      ...(failurePhase ? { failurePhase } : {}),
      ...(typeof failureDetails?.name === 'string' ? { errorName: failureDetails.name } : {}),
      ...(!aborted
        ? {
            errorMessageLength: (typeof failureDetails?.message === 'string'
              ? failureDetails.message
              : String(unwrapped)
            ).length,
            errorMessageFingerprint: errorFingerprint(
              typeof failureDetails?.message === 'string'
                ? failureDetails.message
                : String(unwrapped),
            ),
          }
        : {}),
      ...heapMetrics(),
    });
    if (aborted) throw abortError();
    emitFailureDiagnostic(error, {
      requestKind: requestOptions.requestKind || 'general',
      requestedModelId,
      modelId: actualModelId,
      outcome: 'error',
      startedAt,
      totalMs: Date.now() - startedAt,
      recoveryCount,
      ...(failurePhase ? { failurePhase } : {}),
      ...(typeof failureDetails?.name === 'string' ? { errorName: failureDetails.name } : {}),
      ...heapMetrics(),
    });
    console.error('Error in askWebLLM:', error);
    throw new Error(`Local AI failed: ${errorMessage(unwrapAttemptError(error))}`);
  } finally {
    options.signal?.removeEventListener('abort', forwardAbort);
    unregisterPendingRequest(pendingRequestId);
    scheduleIdleEngineUnload();
  }
};

export const interruptWebLLMModel = async (modelId: string | null | undefined): Promise<void> => {
  await interruptModelRequestsAndEngine(modelId);
};

export const interruptWebLLM = async (): Promise<void> => {
  await interruptAllRequestsAndEngine();
};

export const unloadAllWebLLMEngines = async (): Promise<void> => {
  resetIdleUnloadState();
  clearAllSessionFallbacks();
  clearModelCircuitBreakers();
  await interruptWebLLM();
  await enqueueGeneration(undefined, async () => {
    await disposeCurrentEngine();
  });
};
