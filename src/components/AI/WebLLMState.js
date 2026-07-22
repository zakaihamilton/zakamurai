import { createState } from '@/components/state/State';

export const WebLLMState = createState('WebLLMState');

/** @type {object | null} */
let webLLMStore = null;

export function bindWebLLMStore(store) {
  webLLMStore = store || null;
}

export function getWebLLMStore() {
  return webLLMStore;
}

export function updateWebLLMEngine(modelId, patch) {
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

export function setWebLLMCachedModelIds(ids) {
  if (!webLLMStore) return;
  webLLMStore((draft) => {
    draft.cachedModelIds = Array.isArray(ids) ? ids : [];
  });
}
