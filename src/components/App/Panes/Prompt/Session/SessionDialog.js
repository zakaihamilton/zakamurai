import Dialog from '@/components/ui/Dialog';
import React from 'react';
import { deleteAgentSession, renameAgentSession } from '../AgentSessions';

export default function SessionDialog({
  sessionDialog,
  runningSessionId,
  isAIProcessing,
  agentSessionState,
  promptUiState,
}) {
  if (!sessionDialog) return null;

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
      agentSessionState((draft) => {
        const next = deleteAgentSession(
          { sessions: draft.sessions, activeSessionId: draft.activeSessionId },
          sessionDialog.sessionId,
        );
        draft.sessions = next.sessions;
        draft.activeSessionId = next.activeSessionId;
      });
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
          ? `Delete session "${sessionDialog.name}"?`
          : sessionDialog.message
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
              draft.sessionDialog.value = event.target.value;
            })
          }
        />
      )}
    </Dialog>
  );
}
