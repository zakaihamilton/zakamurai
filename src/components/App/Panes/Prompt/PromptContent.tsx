import type { CssCustomProperties } from '@/components/App/types';
import { formatReasoningEvents } from './AgentSessions';
import ChangeSetPanel from './ChangeSet';
import PromptComposer from './Composer';
import PromptHeader from './Header';
import ModelDownloader from './ModelManager';
import styles from './PromptContent.module.css';
import ReasoningPanel from './Reasoning';
import { SessionDialog, SessionManager, SessionTreeDialog } from './Session';
import type { PromptContentProps } from './prompt-types';

export default function PromptContent({
  isMobile,
  isOpen,
  desktopWidth,
  isAIProcessing,
  isSystemProcessing,
  activeSession,
  sessionReasoning,
  onOpenTree,
  isAgentTreeOpen,
  sessionDialog,
  agentSessionState,
  onCloseTree,
  onSelectSession,
  onCreateSession,
  onBranchSession,
  onRenameSession,
  onDeleteSession,
  runningSessionId,
  promptUiState,
  modelOptions,
  onOpenSectionInTab,
  isModelManagerOpen,
  selectedModelInfo,
  cachedModelIds,
  onCloseModelManager,
  onModelCacheAction,
  modelCacheWork,
  modelCacheProgress,
  modelCacheError,
  value,
  onChange,
  onKeyDown,
  onSubmit,
  onStop,
  isButtonActive,
  isModelDownloading,
  modelDownloadProgress,
  onChangeModel,
  onLoadCachedModelIds,
  onOpenModelManager,
  patchSession,
  latestManagerTrace,
  latestAIIncident,
  onExportAIIncident,
  onCopyAIIncident,
  traceFiles,
  onReplayRequest,
}: PromptContentProps) {
  const transcriptText = activeSession?.messages?.length
    ? activeSession.messages
        .map((m) => `[${m.timestamp || 'now'}] ${m.role}: ${m.text}`)
        .join('\n\n')
    : '';

  const displayedReasoning =
    formatReasoningEvents(
      activeSession?.reasoningEvents || [],
      activeSession?.showStepIO === true,
    ) || sessionReasoning;
  const reasoningText = [
    isModelDownloading
      ? `Downloading ${selectedModelInfo.name || 'AI model'}${
          modelDownloadProgress ? ` — ${modelDownloadProgress}` : '…'
        }`
      : '',
    displayedReasoning,
  ]
    .filter(Boolean)
    .join('\n\n');

  const agentPaneContent =
    [
      transcriptText ? `--- Transcript ---\n${transcriptText}` : null,
      reasoningText ? `--- Reasoning ---\n${reasoningText}` : null,
    ]
      .filter(Boolean)
      .join('\n\n') || 'Start a conversation with the AI Manager.';

  return (
    <aside
      className={`${styles.prompt} ${isOpen ? '' : styles.closed}`}
      aria-hidden={!isOpen}
      style={isMobile ? undefined : ({ '--panel-width': desktopWidth } as CssCustomProperties)}
    >
      <div className={styles.content}>
        <PromptHeader
          isAIProcessing={isAIProcessing}
          isSystemProcessing={isSystemProcessing}
          copyContent={agentPaneContent}
          latestManagerTrace={latestManagerTrace}
          latestAIIncident={latestAIIncident}
          onExportAIIncident={onExportAIIncident}
          onCopyAIIncident={onCopyAIIncident}
          traceFiles={traceFiles}
          onReplayRequest={onReplayRequest}
        />
        <SessionManager activeSession={activeSession} onOpenTree={onOpenTree} isOpen={isOpen} />
        <SessionTreeDialog
          isOpen={isAgentTreeOpen && !sessionDialog}
          sessions={agentSessionState?.sessions || {}}
          activeSessionId={agentSessionState?.activeSessionId}
          onCancel={onCloseTree}
          onSelect={onSelectSession}
          onCreate={onCreateSession}
          onBranch={onBranchSession}
          onRename={onRenameSession}
          onDelete={onDeleteSession}
        />
        <SessionDialog
          sessionDialog={sessionDialog}
          runningSessionId={runningSessionId}
          isAIProcessing={isAIProcessing}
          agentSessionState={agentSessionState}
          promptUiState={promptUiState}
        />
        <ChangeSetPanel onOpenInTab={() => onOpenSectionInTab('changes')} />
        <ModelDownloader
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
          modelDownloadStatus={
            isModelDownloading
              ? `Downloading ${selectedModelInfo.name || 'AI model'}${
                  modelDownloadProgress ? ` — ${modelDownloadProgress}` : '…'
                }`
              : ''
          }
          onOpenInTab={() => onOpenSectionInTab('reasoning')}
          showStepIO={activeSession?.showStepIO === true}
          onToggleStepIO={(show) =>
            activeSession && patchSession(activeSession.id, { showStepIO: show })
          }
        />
        <PromptComposer
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onSubmit={onSubmit}
          onStop={onStop}
          isAIProcessing={isAIProcessing}
          isButtonActive={isButtonActive}
          isOpen={isOpen}
          selectedModelInfo={selectedModelInfo}
          modelOptions={modelOptions}
          onChangeModel={onChangeModel}
          onLoadCachedModelIds={onLoadCachedModelIds}
          onOpenModelManager={onOpenModelManager}
        />
      </div>
    </aside>
  );
}
