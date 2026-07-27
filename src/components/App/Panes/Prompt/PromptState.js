import { RECOMMENDED_WEB_LLM_MODEL, resolveWebLLMModelId } from '@/components/AI/WebLLMModels';
import Settings from '@/components/Storage/Settings';
import { createState } from '@/components/state/State';

export const PromptState = createState('PromptState');
export const PromptUiState = createState('PromptUiState');

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
    runningSessionId: null,
    isAgentTreeOpen: false,
  };
}
