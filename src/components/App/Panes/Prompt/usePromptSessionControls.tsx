import type { AgentSession, AgentSessionMessage } from '@/components/state/domain-types';
import { useCallback, useEffect } from 'react';
import {
  addAgentSession,
  appendSessionMessage,
  createAgentBranch,
  createDefaultAgentSessions,
  getActiveAgentSession,
  getAgentSessionSubtreeIds,
  setActiveAgentSession,
  updateAgentSession,
} from './AgentSessions';
import type { UsePromptSessionControlsParams } from './prompt-types';

/** Owns agent-session mutations while keeping the Prompt component as the store subscriber. */
export default function usePromptSessionControls({
  agentSessionState,
  promptUiState,
  selectedModel,
  isAIProcessing,
  isRoleGraphOpen,
}: UsePromptSessionControlsParams) {
  useEffect(() => {
    if (!agentSessionState) return;
    if (
      agentSessionState.activeSessionId &&
      agentSessionState.sessions?.[agentSessionState.activeSessionId]
    ) {
      return;
    }
    const defaults = createDefaultAgentSessions(selectedModel);
    agentSessionState((draft) => {
      draft.sessions = defaults.sessions;
      draft.activeSessionId = defaults.activeSessionId;
    });
  }, [agentSessionState, selectedModel]);

  const activeSession = getActiveAgentSession(agentSessionState);

  const patchSession = useCallback(
    (sessionId: string, patch: Partial<AgentSession>) => {
      agentSessionState((draft) => {
        const next = updateAgentSession(
          { sessions: draft.sessions, activeSessionId: draft.activeSessionId },
          sessionId,
          patch,
        );
        draft.sessions = next.sessions;
        draft.activeSessionId = next.activeSessionId;
      });
    },
    [agentSessionState],
  );

  const pushSessionMessage = useCallback(
    (sessionId: string, message: AgentSessionMessage) => {
      agentSessionState((draft) => {
        const next = appendSessionMessage(
          { sessions: draft.sessions, activeSessionId: draft.activeSessionId },
          sessionId,
          message,
        );
        draft.sessions = next.sessions;
      });
    },
    [agentSessionState],
  );

  const openRoleGraph = useCallback(() => {
    promptUiState((draft) => {
      draft.isRoleGraphOpen = true;
    });
  }, [promptUiState]);

  const closeRoleGraph = useCallback(() => {
    promptUiState((draft) => {
      draft.isRoleGraphOpen = false;
    });
  }, [promptUiState]);

  useEffect(() => {
    if (activeSession?.mode !== 'team' && isRoleGraphOpen) closeRoleGraph();
  }, [activeSession?.mode, closeRoleGraph, isRoleGraphOpen]);

  const handleCreateSession = useCallback(() => {
    try {
      agentSessionState((draft) => {
        const next = addAgentSession(
          { sessions: draft.sessions, activeSessionId: draft.activeSessionId },
          { modelId: selectedModel },
        );
        draft.sessions = next.sessions;
        draft.activeSessionId = next.activeSessionId;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      promptUiState((draft) => {
        draft.sessionDialog = { type: 'error', message };
      });
    }
  }, [agentSessionState, promptUiState, selectedModel]);

  const handleRenameSession = useCallback(
    (sessionId: string = activeSession?.id || '') => {
      const session = agentSessionState?.sessions?.[sessionId];
      if (!session) return;
      promptUiState((draft) => {
        draft.sessionDialog = { type: 'rename', sessionId: session.id, value: session.name };
      });
    },
    [activeSession?.id, agentSessionState, promptUiState],
  );

  const handleDeleteSession = useCallback(
    (sessionId: string = activeSession?.id || '') => {
      const session = agentSessionState?.sessions?.[sessionId];
      if (!session) return;
      const subtreeIds = getAgentSessionSubtreeIds(agentSessionState.sessions, session.id);
      const hasRunningAgent = [...subtreeIds].some(
        (id) => agentSessionState.sessions[id]?.status === 'running',
      );
      promptUiState((draft) => {
        draft.sessionDialog = hasRunningAgent
          ? {
              type: 'error',
              message: 'Stop the running agent before deleting it or any of its branches.',
            }
          : {
              type: 'delete',
              sessionId: session.id,
              name: session.name,
              descendantCount: Math.max(0, subtreeIds.size - 1),
            };
      });
    },
    [activeSession?.id, agentSessionState, promptUiState],
  );

  const handleBranchSession = useCallback(
    (sessionId: string) => {
      try {
        agentSessionState((draft) => {
          const next = createAgentBranch(
            { sessions: draft.sessions, activeSessionId: draft.activeSessionId },
            sessionId,
          );
          draft.sessions = next.sessions;
          draft.activeSessionId = next.activeSessionId;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        promptUiState((draft) => {
          draft.sessionDialog = { type: 'error', message };
        });
      }
    },
    [agentSessionState, promptUiState],
  );

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      agentSessionState((draft) => {
        const next = setActiveAgentSession(
          { sessions: draft.sessions, activeSessionId: draft.activeSessionId },
          sessionId,
        );
        draft.activeSessionId = next.activeSessionId;
      });
    },
    [agentSessionState],
  );

  const handleModeChange = useCallback(
    (mode: string) => {
      if (!activeSession || isAIProcessing) return;
      patchSession(activeSession.id, { mode: mode === 'team' ? 'team' : 'single' });
    },
    [activeSession, isAIProcessing, patchSession],
  );

  return {
    activeSession,
    patchSession,
    pushSessionMessage,
    openRoleGraph,
    closeRoleGraph,
    handleCreateSession,
    handleRenameSession,
    handleDeleteSession,
    handleBranchSession,
    handleSelectSession,
    handleModeChange,
  };
}
