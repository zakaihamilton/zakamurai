import { getWebLLMStore } from '../WebLLMState';

export {
  type BuildUserRequestOptions,
  CHANGE_REQUEST_PATTERN,
  SMALL_MODEL_CONTEXT_READY_CHAR_BUDGET,
  buildContextReadyUserRequest,
  buildUserRequest,
} from './ActionLoopPromptBuilder';
export {
  buildActionLoopModelMessages,
  buildDirectChangesRecoveryMessages,
  buildForcedWriteRecoveryMessages,
  buildRepairFileMessages,
  isIncompleteWriteError,
  recordTruncatedModelOutput,
  writeRecovery,
} from './ActionLoopRecoveryPrompts';
export {
  APP_ENTRY_PATHS,
  createAutoFinishSummary,
  isScratchEntry,
  newlyCreatedComponentsNeedEntryWiring,
  normalizeFinishSummary,
  recoverDeferredSource,
  recoveryWritePath,
  wireNewComponentIntoScratchEntry,
} from './ActionLoopScratchWiring';

export const AGENT_CONTEXT_WINDOW_SIZE = 4096;
export const AGENT_GENERATION_TOKENS = 2000;
export const AGENT_RECOVERY_TOKENS = 2600;
export const LIGHTWEIGHT_AGENT_GENERATION_TOKENS = 2000;
export const LIGHTWEIGHT_AGENT_RECOVERY_TOKENS = 2600;

export const loadAskWebLLM = async () => (await import('../WebLLMAPI')).askWebLLM;

export const getModelDownloadProgress = (modelId: string): string | null => {
  const store = getWebLLMStore();
  const engines = store?.engines || {};
  const modelIds = [modelId, store?.activeModelId].filter(
    (id, index, ids): id is string => typeof id === 'string' && ids.indexOf(id) === index,
  );
  const downloadingEngine = modelIds
    .map((id) => engines[id])
    .find((engine) => engine?.status === 'downloading');
  if (!downloadingEngine) return null;
  return downloadingEngine.progressText
    ? `the model is downloading — ${downloadingEngine.progressText}`
    : 'the model is downloading; waiting for model files';
};
