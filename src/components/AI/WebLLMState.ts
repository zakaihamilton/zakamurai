import type { StateHandle, WebLLMEngineState, WebLLMStateDraft } from '@/components/AI/types';
import { createState } from '@/components/state/State';

export const WebLLMState = createState('WebLLMState');

let webLLMStore: StateHandle<WebLLMStateDraft> | null = null;

export function bindWebLLMStore(store: StateHandle<WebLLMStateDraft> | null): void {
  webLLMStore = store || null;
}

export function getWebLLMStore(): StateHandle<WebLLMStateDraft> | null {
  return webLLMStore;
}

export function updateWebLLMEngine(modelId: string, patch: WebLLMEngineState): void {
  if (!webLLMStore || !modelId) return;
  webLLMStore((draft) => {
    const engines = { ...(draft.engines || {}) };
    engines[modelId] = { ...(engines[modelId] || {}), ...patch };
    draft.engines = engines;
    if (patch.status === 'ready' || patch.status === 'downloading') {
      draft.activeModelId = modelId;
    }
  });
}

export function setWebLLMCachedModelIds(ids: string[]): void {
  if (!webLLMStore) return;
  webLLMStore((draft) => {
    draft.cachedModelIds = Array.isArray(ids) ? ids : [];
  });
}
