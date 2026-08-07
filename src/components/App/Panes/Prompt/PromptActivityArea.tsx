import { ModelManager } from '@/components/AI/Models';
import ChangeSetPanel from './ChangeSet';
import ReasoningPanel from './Reasoning';
import type { PromptActivityAreaProps } from './prompt-types';

export default function PromptActivityArea({
  activeSession,
  onOpenSectionInTab,
  isModelManagerOpen,
  selectedModelInfo,
  cachedModelIds,
  onCloseModelManager,
  onModelCacheAction,
  modelCacheWork,
  modelCacheProgress,
  modelCacheError,
  isModelDownloading,
  modelDownloadProgress,
  patchSession,
  onClearAIModelLog,
}: PromptActivityAreaProps) {
  const modelDownloadStatus = isModelDownloading
    ? `Downloading ${selectedModelInfo.name || 'AI model'}${
        modelDownloadProgress ? ` — ${modelDownloadProgress}` : '…'
      }`
    : '';

  return (
    <>
      <ChangeSetPanel onOpenInTab={() => onOpenSectionInTab('changes')} />
      <ModelManager
        isOpen={isModelManagerOpen}
        selectedModelId={selectedModelInfo.id}
        cachedModelIds={cachedModelIds}
        onCancel={onCloseModelManager}
        onModelCacheAction={onModelCacheAction}
        modelCacheWork={modelCacheWork}
        modelCacheProgress={modelCacheProgress}
        modelCacheError={modelCacheError}
      />
      <ReasoningPanel
        modelDownloadStatus={modelDownloadStatus}
        onOpenInTab={() => onOpenSectionInTab('reasoning')}
        onClearLog={onClearAIModelLog}
        showStepIO={activeSession?.showStepIO === true}
        onToggleStepIO={(show) =>
          activeSession && patchSession(activeSession.id, { showStepIO: show })
        }
      />
    </>
  );
}
