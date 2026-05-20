import { useCallback, useRef } from 'react';

export default function useModelDownloader(promptUiState) {
  const hasLoadedModelCacheRef = useRef(false);

  const setPromptUiValue = useCallback(
    (key, nextValue) => {
      promptUiState((draft) => {
        draft[key] = typeof nextValue === 'function' ? nextValue(draft[key]) : nextValue;
      });
    },
    [promptUiState],
  );

  const setCachedModelIds = useCallback(
    (nextValue) => setPromptUiValue('cachedModelIds', nextValue),
    [setPromptUiValue],
  );
  const setModelCacheWork = useCallback(
    (nextValue) => setPromptUiValue('modelCacheWork', nextValue),
    [setPromptUiValue],
  );
  const setModelCacheProgress = useCallback(
    (nextValue) => setPromptUiValue('modelCacheProgress', nextValue),
    [setPromptUiValue],
  );
  const setModelCacheError = useCallback(
    (nextValue) => setPromptUiValue('modelCacheError', nextValue),
    [setPromptUiValue],
  );

  const refreshCachedModelIds = useCallback(() => {
    return import('@/components/AI/WebLLMAPI')
      .then(({ getCachedWebLLMModelIds }) => getCachedWebLLMModelIds())
      .then(setCachedModelIds)
      .catch((error) => {
        hasLoadedModelCacheRef.current = false;
        console.warn('[Prompt] Failed to load cached model metadata:', error);
      });
  }, [setCachedModelIds]);

  const loadCachedModelIds = useCallback(() => {
    if (hasLoadedModelCacheRef.current) return;
    hasLoadedModelCacheRef.current = true;

    refreshCachedModelIds();
  }, [refreshCachedModelIds]);

  const openModelManager = useCallback(() => {
    promptUiState((draft) => {
      draft.isModelManagerOpen = true;
    });
    loadCachedModelIds();
  }, [promptUiState, loadCachedModelIds]);

  const closeModelManager = useCallback(() => {
    promptUiState((draft) => {
      draft.isModelManagerOpen = false;
    });
    setModelCacheError('');
    setModelCacheProgress('');
  }, [promptUiState, setModelCacheError, setModelCacheProgress]);

  const handleModelCacheAction = useCallback(
    async (model, action) => {
      const key = `${action}:${model.id}`;
      setModelCacheWork(key);
      setModelCacheError('');
      setModelCacheProgress(action === 'cache' ? 'Preparing download...' : 'Removing cache...');

      try {
        if (action === 'cache') {
          const { cacheWebLLMModel } = await import('@/components/AI/WebLLMAPI');
          await cacheWebLLMModel(model.id, setModelCacheProgress);
        } else {
          const { deleteCachedWebLLMModel } = await import('@/components/AI/WebLLMAPI');
          await deleteCachedWebLLMModel(model.id);
        }
        hasLoadedModelCacheRef.current = true;
        await refreshCachedModelIds();
        setModelCacheProgress(action === 'cache' ? 'Cached and ready.' : 'Cache removed.');
      } catch (error) {
        setModelCacheError(error.message || String(error));
      } finally {
        setModelCacheWork(null);
      }
    },
    [setModelCacheWork, setModelCacheError, setModelCacheProgress, refreshCachedModelIds],
  );

  return {
    loadCachedModelIds,
    refreshCachedModelIds,
    openModelManager,
    closeModelManager,
    handleModelCacheAction,
  };
}
