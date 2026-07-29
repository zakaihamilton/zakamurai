import type { PromptUiStateShape } from '@/components/state/domain-types';
import type { StateStore } from '@/components/state/types';
import type { ModelOption } from '@/components/App/Panes/Prompt/prompt-types';
import { useCallback, useRef } from 'react';

type PromptUiKey = keyof PromptUiStateShape;

export default function useModelDownloader(promptUiState: StateStore<PromptUiStateShape>) {
  const hasLoadedModelCacheRef = useRef(false);

  const setPromptUiValue = useCallback(
    <K extends PromptUiKey>(
      key: K,
      nextValue:
        | PromptUiStateShape[K]
        | ((current: PromptUiStateShape[K]) => PromptUiStateShape[K]),
    ) => {
      promptUiState((draft) => {
        draft[key] =
          typeof nextValue === 'function'
            ? (nextValue as (current: PromptUiStateShape[K]) => PromptUiStateShape[K])(draft[key])
            : nextValue;
      });
    },
    [promptUiState],
  );

  const setModelCacheWork = useCallback(
    (nextValue: PromptUiStateShape['modelCacheWork']) =>
      setPromptUiValue('modelCacheWork', nextValue),
    [setPromptUiValue],
  );
  const setModelCacheProgress = useCallback(
    (nextValue: string) => setPromptUiValue('modelCacheProgress', nextValue),
    [setPromptUiValue],
  );
  const setModelCacheError = useCallback(
    (nextValue: string) => setPromptUiValue('modelCacheError', nextValue),
    [setPromptUiValue],
  );

  const refreshCachedModelIds = useCallback(() => {
    return import('@/components/AI/WebLLMAPI')
      .then(({ getCachedWebLLMModelIds }) => getCachedWebLLMModelIds())
      .catch((error: unknown) => {
        hasLoadedModelCacheRef.current = false;
        console.warn('[Prompt] Failed to load cached model metadata:', error);
      });
  }, []);

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
    async (model: ModelOption, action: 'cache' | 'delete' | 'uncache') => {
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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setModelCacheError(message);
      } finally {
        setModelCacheWork(null);
        setModelCacheProgress('');
      }
    },
    [refreshCachedModelIds, setModelCacheError, setModelCacheProgress, setModelCacheWork],
  );

  return {
    loadCachedModelIds,
    openModelManager,
    closeModelManager,
    handleModelCacheAction,
  };
}
