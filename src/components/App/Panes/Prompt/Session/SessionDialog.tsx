import Dialog from '@/components/ui/Dialog';
import { deleteAgentSession, renameAgentSession } from '../AgentSessions';
import type { SessionDialogProps } from '../prompt-types';

export default function SessionDialog({
  sessionDialog,
  runningSessionId,
  isAIProcessing,
  agentSessionState,
  promptUiState,
}: SessionDialogProps) {
  if (!sessionDialog || !agentSessionState) return null;

  const handleConfirm = () => {
    if (sessionDialog.type === 'rename') {
      agentSessionState((draft) => {
        const next = renameAgentSession(
          { sessions: draft.sessions, activeSessionId: draft.activeSessionId },
          sessionDialog.sessionId,
          sessionDialog.value,
        );
        draft.sessions = next.sessions;
      });
    } else if (sessionDialog.type === 'delete') {
      if (runningSessionId === sessionDialog.sessionId && isAIProcessing) {
        promptUiState((draft) => {
          draft.sessionDialog = {
            type: 'error',
            message: 'Stop the running agent before deleting this session.',
          };
        });
        return;
      }
      try {
        agentSessionState((draft) => {
          const next = deleteAgentSession(
            { sessions: draft.sessions, activeSessionId: draft.activeSessionId },
            sessionDialog.sessionId,
          );
          draft.sessions = next.sessions;
          draft.activeSessionId = next.activeSessionId;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        promptUiState((draft) => {
          draft.sessionDialog = { type: 'error', message };
        });
        return;
      }
    }
    promptUiState((draft) => {
      draft.sessionDialog = null;
    });
  };

  const handleCancel = () => {
    promptUiState((draft) => {
      draft.sessionDialog = null;
    });
  };

  return (
    <Dialog
      isOpen={!!sessionDialog}
      title={
        sessionDialog.type === 'rename'
          ? 'Rename session'
          : sessionDialog.type === 'delete'
            ? 'Delete session?'
            : 'Session error'
      }
      message={
        sessionDialog.type === 'delete'
          ? `Delete "${sessionDialog.name}" and ${sessionDialog.descendantCount || 0} branch${sessionDialog.descendantCount === 1 ? '' : 'es'}? This cannot be undone.`
          : sessionDialog.type === 'error'
            ? sessionDialog.message
            : undefined
      }
      confirmText={
        sessionDialog.type === 'rename'
          ? 'Rename'
          : sessionDialog.type === 'delete'
            ? 'Delete'
            : 'OK'
      }
      cancelText={sessionDialog.type === 'error' ? 'Close' : 'Cancel'}
      type={sessionDialog.type === 'delete' ? 'danger' : 'default'}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    >
      {sessionDialog.type === 'rename' && (
        <input
          aria-label="Session name"
          value={sessionDialog.value}
          onChange={(event) =>
            promptUiState((draft) => {
              if (draft.sessionDialog?.type === 'rename') {
                draft.sessionDialog.value = event.target.value;
              }
            })
          }
        />
      )}
    </Dialog>
  );
}
