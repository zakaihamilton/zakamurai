import { requireSessionId } from '@/test-utils/agentSessionMocks';
import { makeAgentSessionState, makePromptUiState } from '@/test-utils/stateMocks';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createDefaultAgentSessions } from './AgentSessions';
import usePromptSessionControls from './usePromptSessionControls';

describe('usePromptSessionControls', () => {
  it('branches an active session and opens a review dialog for deletion', () => {
    const defaults = createDefaultAgentSessions('test-model');
    const agentSessionState = makeAgentSessionState(defaults);
    const promptUiState = makePromptUiState({ isRoleGraphOpen: false });
    const { result } = renderHook(() =>
      usePromptSessionControls({
        agentSessionState,
        promptUiState,
        selectedModel: 'test-model',
        isAIProcessing: false,
        isRoleGraphOpen: false,
      }),
    );
    const activeSessionId = requireSessionId(defaults.activeSessionId);

    act(() => {
      result.current.handleBranchSession(activeSessionId);
    });
    expect(Object.keys(agentSessionState.sessions)).toHaveLength(2);

    act(() => {
      result.current.handleDeleteSession(activeSessionId);
    });
    expect(promptUiState.sessionDialog).toMatchObject({
      type: 'delete',
      sessionId: activeSessionId,
      descendantCount: 1,
    });
  });
});
