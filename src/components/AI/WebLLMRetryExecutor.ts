import type { WebLLMMessage, WebLLMOptions } from '@/components/AI/types';
import { waitForNetworkRetry } from './WebLLMAsyncUtils';
import {
  deleteSessionFallback,
  getCachedWebLLMModelIds,
  getRememberedFallback,
  rememberFallback,
} from './WebLLMCache';
import { runAttempt } from './WebLLMCompletionRunner';
import { disposeCurrentEngine } from './WebLLMEngineManager';
import type { AttemptResult } from './WebLLMEngineTypes';
import { emitRecovery, ensureSystemMessageFirst, safeCallback } from './WebLLMMessageUtils';
import { findCachedFallbackModelId } from './WebLLMModels';
import {
  type WebLLMAttemptError,
  errorMessage,
  isAbortError,
  recoveryReason,
} from './WebLLMRecovery';
import { clearModelFailure, isModelCircuitOpen, noteModelFailure } from './WebLLMReliabilityState';
import { clearSessionHistories } from './WebLLMSession';
import { updateWebLLMEngine } from './WebLLMState';

export const executeWithRecovery = async (
  requestedModelId: string,
  messages: WebLLMMessage[],
  onUpdate: ((text: string) => void) | null,
  options: WebLLMOptions,
): Promise<{ result: AttemptResult; recoveryCount: number }> => {
  let recoveryCount = 0;
  let retryMessages = messages;
  const rememberedFallback = await getRememberedFallback(requestedModelId);
  let modelId = rememberedFallback?.modelId || requestedModelId;
  if (!rememberedFallback && isModelCircuitOpen(requestedModelId)) {
    const cachedModelIds = await getCachedWebLLMModelIds();
    modelId = findCachedFallbackModelId(requestedModelId, cachedModelIds) || requestedModelId;
  }
  if (rememberedFallback) {
    recoveryCount++;
    emitRecovery(options, {
      requestedModelId,
      modelId,
      phase: 'initialization',
      action: 'reuse-fallback',
      reason: rememberedFallback.reason,
      attempt: recoveryCount,
    });
  }

  try {
    const result = await runAttempt(modelId, messages, onUpdate, options);
    clearModelFailure(modelId);
    if (modelId === requestedModelId) deleteSessionFallback(requestedModelId);
    return { result, recoveryCount };
  } catch (firstError) {
    if (isAbortError(firstError, options.signal)) throw firstError;
    const firstReason = recoveryReason(firstError);
    if (!firstReason) throw firstError;
    noteModelFailure(modelId, firstReason);
    recoveryCount++;
    // runAttempt wraps every non-abort failure with its phase.
    const firstPhase = (firstError as WebLLMAttemptError).phase;
    emitRecovery(options, {
      requestedModelId,
      modelId,
      phase: firstPhase,
      action: 'retry',
      reason: firstReason,
      attempt: recoveryCount,
    });
    updateWebLLMEngine(modelId, { status: 'recovering', error: errorMessage(firstError) });
    safeCallback(onUpdate, '');
    if (firstReason === 'invalid-context') {
      clearSessionHistories();
      retryMessages = ensureSystemMessageFirst(messages.map((message) => ({ ...message })));
    } else {
      await disposeCurrentEngine(modelId);
    }
    if (firstReason === 'network-failure') await waitForNetworkRetry();

    // Retrying the same allocation after OOM is counterproductive. A repeatedly stalled
    // model is also isolated for this session and moved directly to a cached smaller tier.
    if (firstReason === 'out-of-memory' || isModelCircuitOpen(modelId)) {
      const cachedModelIds = await getCachedWebLLMModelIds();
      const fallbackModelId = findCachedFallbackModelId(modelId, cachedModelIds);
      if (!fallbackModelId) throw firstError;
      recoveryCount++;
      emitRecovery(options, {
        requestedModelId,
        modelId: fallbackModelId,
        phase: firstPhase,
        action: 'fallback',
        reason: firstReason,
        attempt: recoveryCount,
      });
      rememberFallback(requestedModelId, fallbackModelId, firstReason);
      const result = await runAttempt(fallbackModelId, retryMessages, onUpdate, options);
      clearModelFailure(fallbackModelId);
      return { result, recoveryCount };
    }
  }

  try {
    const result = await runAttempt(modelId, retryMessages, onUpdate, options);
    clearModelFailure(modelId);
    deleteSessionFallback(requestedModelId);
    return { result, recoveryCount };
  } catch (retryError) {
    if (isAbortError(retryError, options.signal)) throw retryError;
    const retryReason = recoveryReason(retryError);
    if (!retryReason) throw retryError;
    noteModelFailure(modelId, retryReason);
    const cachedModelIds = await getCachedWebLLMModelIds();
    const fallbackModelId = findCachedFallbackModelId(modelId, cachedModelIds);
    if (!fallbackModelId) throw retryError;

    recoveryCount++;
    const retryPhase = (retryError as WebLLMAttemptError).phase;
    emitRecovery(options, {
      requestedModelId,
      modelId: fallbackModelId,
      phase: retryPhase,
      action: 'fallback',
      reason: retryReason,
      attempt: recoveryCount,
    });
    safeCallback(onUpdate, '');
    rememberFallback(requestedModelId, fallbackModelId, retryReason);
    await disposeCurrentEngine(modelId);
    updateWebLLMEngine(modelId, {
      status: 'degraded',
      error: `Using cached fallback ${fallbackModelId}.`,
      generating: false,
    });
    const result = await runAttempt(fallbackModelId, messages, onUpdate, options);
    clearModelFailure(fallbackModelId);
    return { result, recoveryCount };
  }
};
