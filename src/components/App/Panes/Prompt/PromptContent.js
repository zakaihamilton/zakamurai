import React from 'react';
import ChangeSetPanel from './ChangeSet';
import PromptComposer from './Composer';
import PromptContextPanel from './Context';
import PromptHeader from './Header';
import ModelDownloader from './ModelManager';
import styles from './PromptContent.module.css';
import ReasoningPanel from './Reasoning';
import { RoleGraphDialog, RoleGraphSummary } from './RoleGraph';
import { SessionDialog, SessionManager, SessionTranscript, SessionTreeDialog } from './Session';

export default function PromptContent({
  isMobile,
  isOpen,
  desktopWidth,
  isAIProcessing,
  isSystemProcessing,
  activeSession,
  sessionReasoning,
  isReasoningVisible,
  onToggleReasoning,
  onModeChange,
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
  isRoleGraphOpen,
  onOpenRoleGraph,
  onCloseRoleGraph,
  modelOptions,
  selectedModel,
  promptScope,
  onScopeChange,
  activeFileName,
  activeFilePath,
  selectedLines,
  selectedLineText,
  runState,
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
  onChangeModel,
  onLoadCachedModelIds,
  onOpenModelManager,
  patchSession,
}) {
  return (
    <aside
      className={`${styles.prompt} ${isOpen ? '' : styles.closed}`}
      aria-hidden={!isOpen}
      style={isMobile ? undefined : { '--panel-width': desktopWidth }}
    >
      <div className={styles.content}>
        <PromptHeader
          isAIProcessing={isAIProcessing}
          isSystemProcessing={isSystemProcessing}
          hasReasoning={Boolean(sessionReasoning)}
          isReasoningVisible={isReasoningVisible}
          onToggleReasoning={onToggleReasoning}
          mode={activeSession?.mode || 'single'}
          onModeChange={onModeChange}
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
        {activeSession?.mode === 'team' && (
          <RoleGraphSummary
            roleGraph={activeSession.roleGraph}
            disabled={!isOpen || isAIProcessing}
            onEdit={onOpenRoleGraph}
          />
        )}
        <PromptContextPanel
          scope={promptScope}
          onScopeChange={onScopeChange}
          activeFileName={activeFileName}
          activeFilePath={activeFilePath}
          selectedLines={selectedLines}
          selectedLineText={selectedLineText}
          runState={runState}
        />
        <ChangeSetPanel />
        <SessionTranscript messages={activeSession?.messages || []} />
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
        <RoleGraphDialog
          isOpen={isRoleGraphOpen}
          onCancel={onCloseRoleGraph}
          roleGraph={activeSession?.roleGraph}
          modelOptions={modelOptions}
          defaultModelId={selectedModel}
          disabled={isAIProcessing}
          onChange={(nextGraph) =>
            activeSession && patchSession(activeSession.id, { roleGraph: nextGraph })
          }
        />
        <ReasoningPanel />
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
