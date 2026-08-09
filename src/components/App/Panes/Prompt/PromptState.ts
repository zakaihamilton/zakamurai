import {
  getDeviceAppropriateDefaultModelId,
  resolveWebLLMModelId,
} from '@/components/AI/WebLLMModels';
import Settings from '@/components/Storage/Settings';
import { createState } from '@/components/state/State';
import type { PromptStateShape, PromptUiStateShape } from '@/components/state/domain-types';

export const PromptState = createState<PromptStateShape>('PromptState');
export const PromptUiState = createState<PromptUiStateShape>('PromptUiState');

export function getInitialPromptSelectedModel() {
  const savedModelId = Settings.getAIPromptModel('');
  return resolveWebLLMModelId(savedModelId || getDeviceAppropriateDefaultModelId());
}

export function getInitialPromptUiState() {
  const draft = Settings.getPromptDraft() || '';
  const welcomePrompt = Settings.getWelcomePromptDraft() || '';
  return {
    val: draft,
    historyIndex: -1,
    draftVal: draft,
    welcomePrompt,
    selectedModel: getInitialPromptSelectedModel(),
    isModelManagerOpen: false,
    cachedModelIds: [],
    modelCacheWork: null,
    modelCacheProgress: '',
    modelCacheError: '',
    animatedWidth: 0,
    abortController: null,
    promptScope: 'project',
    welcomeRequest: null,
    runningSessionId: null,
    stopRequest: 0,
    isAgentTreeOpen: false,
    latestManagerTrace: null,
    latestAIIncident: null,
  };
}
