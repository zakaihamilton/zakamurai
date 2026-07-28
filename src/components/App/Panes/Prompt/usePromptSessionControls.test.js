import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultAgentSessions } from './AgentSessions';
import usePromptSessionControls from './usePromptSessionControls';

function createStore(initial) {
  const value = { ...initial };
  const store = vi.fn((updater) => {
    updater(value);
    Object.assign(store, value);
  });
  Object.assign(store, value);
  return store;
}

describe('usePromptSessionControls', () => {
  it('branches an active session and opens a review dialog for deletion', () => {
    const defaults = createDefaultAgentSessions('test-model');
    const agentSessionState = createStore(defaults);
    const promptUiState = createStore({ isRoleGraphOpen: false });
    const { result } = renderHook(() =>
      usePromptSessionControls({
        agentSessionState,
        promptUiState,
        selectedModel: 'test-model',
        isAIProcessing: false,
        isRoleGraphOpen: false,
      }),
    );
    const activeSessionId = defaults.activeSessionId;

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
