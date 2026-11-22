import type { WebLLMRecoveryReason } from '@/components/AI/types';
import { FALLBACK_TTL_MS, enqueueGeneration, loadWebLLM } from './WebLLMAsyncUtils';
import {
  clearIdleUnloadTimer,
  disposeCurrentEngine,
  getEngine,
  interruptModelRequestsAndEngine,
  scheduleIdleEngineUnload,
} from './WebLLMEngineManager';
import type { SessionFallback } from './WebLLMEngineTypes';
import { WEB_LLM_MODELS } from './WebLLMModels';
import { clearModelFailure } from './WebLLMReliabilityState';
import { setWebLLMCachedModelIds } from './WebLLMState';

const sessionFallbacks = new Map<string, SessionFallback>();

export const rememberFallback = (
  requestedModelId: string,
  modelId: string,
  reason: WebLLMRecoveryReason,
): void => {
  sessionFallbacks.set(requestedModelId, {
    modelId,
    reason,
    expiresAt: Date.now() + FALLBACK_TTL_MS,
  });
};

export const deleteSessionFallback = (requestedModelId: string): void => {
  sessionFallbacks.delete(requestedModelId);
};

export const clearAllSessionFallbacks = (): void => {
  sessionFallbacks.clear();
};

export const getRememberedFallback = async (
  requestedModelId: string,
): Promise<SessionFallback | null> => {
  const fallback = sessionFallbacks.get(requestedModelId);
  if (!fallback) return null;
  if (fallback.expiresAt <= Date.now()) {
    sessionFallbacks.delete(requestedModelId);
    return null;
  }
  try {
    const { hasModelInCache } = await loadWebLLM();
    if (await hasModelInCache(fallback.modelId)) return fallback;
  } catch (error) {
    console.warn('[WebLLM] Failed to verify remembered fallback:', error);
  }
  sessionFallbacks.delete(requestedModelId);
  return null;
};

export const getCachedWebLLMModelIds = async (): Promise<string[]> => {
  const { hasModelInCache } = await loadWebLLM();
  const cacheEntries = await Promise.all(
    WEB_LLM_MODELS.map(async (model) => {
      try {
        return [model.id, await hasModelInCache(model.id)] as const;
      } catch (error) {
        console.warn(`Failed to check WebLLM cache for ${model.id}:`, error);
        return [model.id, false] as const;
      }
    }),
  );
  const ids = cacheEntries.filter(([, isCached]) => isCached).map(([modelId]) => modelId);
  setWebLLMCachedModelIds(ids);
  return ids;
};

export const cacheWebLLMModel = async (
  modelId: string,
  onProgress: ((progress: string) => void) | null = null,
): Promise<void> => {
  clearIdleUnloadTimer();
  sessionFallbacks.delete(modelId);
  try {
    await enqueueGeneration(undefined, async () => {
      await getEngine(modelId, onProgress, { requestKind: 'model-cache' }, () => {
        void getCachedWebLLMModelIds();
      });
    });
  } finally {
    scheduleIdleEngineUnload();
  }
};

export const deleteCachedWebLLMModel = async (modelId: string): Promise<void> => {
  clearModelFailure(modelId);
  for (const [requestedModelId, fallback] of sessionFallbacks.entries()) {
    if (requestedModelId === modelId || fallback.modelId === modelId) {
      sessionFallbacks.delete(requestedModelId);
      clearModelFailure(requestedModelId);
    }
  }
  await interruptModelRequestsAndEngine(modelId);
  await enqueueGeneration(undefined, async () => {
    await disposeCurrentEngine(modelId);
    const { deleteModelAllInfoInCache } = await loadWebLLM();
    await deleteModelAllInfoInCache(modelId);
    await getCachedWebLLMModelIds();
  });
};
