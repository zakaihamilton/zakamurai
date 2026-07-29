import { RECOMMENDED_WEB_LLM_MODEL, resolveWebLLMModelId } from '@/components/AI/WebLLMModels';
import Settings from '@/components/Storage/Settings';
import { createState } from '@/components/state/State';
import type { PromptStateShape, PromptUiStateShape } from '@/components/state/domain-types';

export const PromptState = createState<PromptStateShape>('PromptState');
export const PromptUiState = createState<PromptUiStateShape>('PromptUiState');

export function getInitialPromptSelectedModel() {
  return resolveWebLLMModelId(
    Settings.getAIPromptModel(RECOMMENDED_WEB_LLM_MODEL.id) || RECOMMENDED_WEB_LLM_MODEL.id,
  );
}

export function getInitialPromptUiState() {
  const draft = Settings.getPromptDraft() || '';
  return {
    val: draft,
    historyIndex: -1,
    draftVal: draft,
    isReasoningVisible: true,
    selectedModel: getInitialPromptSelectedModel(),
    isModelManagerOpen: false,
    isRoleGraphOpen: false,
    cachedModelIds: [],
    modelCacheWork: null,
    modelCacheProgress: '',
    modelCacheError: '',
    animatedWidth: 0,
    abortController: null,
    promptScope: 'file',
    welcomeRequest: null,
    runningSessionId: null,
    isAgentTreeOpen: false,
  };
}
