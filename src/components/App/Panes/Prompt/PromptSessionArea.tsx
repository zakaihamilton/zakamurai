import { SessionDialog, SessionManager, SessionTreeDialog } from './Session';
import type { PromptSessionAreaProps } from './prompt-types';

export default function PromptSessionArea({
  activeSession,
  isOpen,
  isAgentTreeOpen,
  sessionDialog,
  agentSessionState,
  onOpenTree,
  onCloseTree,
  onSelectSession,
  onCreateSession,
  onBranchSession,
  onRenameSession,
  onDeleteSession,
  runningSessionId,
  isAIProcessing,
  promptUiState,
}: PromptSessionAreaProps) {
  return (
    <>
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
    </>
  );
}
