import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useAgentRunner, { formatAgentEvent } from './useAgentRunner';

vi.mock('@/components/Workspace', () => ({
  ChangeSetState: { usePassiveState: () => ({}) },
  getWorkspaceIndex: () => ({ queryText: vi.fn().mockResolvedValue([]) }),
}));

function createRunnerProps(overrides = {}) {
  const patchSession = vi.fn();
  const pushSessionMessage = vi.fn();
  const createSessionMessage = vi.fn((message) => ({ ...message, id: 'msg-1' }));
  const promptUiState = vi.fn();
  const logState = vi.fn();
  const addToHistory = vi.fn();

  return {
    val: 'hello',
    isAIProcessing: false,
    activeSession: {
      id: 'session-1',
      name: 'Default',
      mode: 'single',
      roleGraph: { roles: [] },
    },
    agentSessionState: { activeSessionId: 'session-1' },
    promptUiState,
    promptScope: 'project',
    selectedModel: 'test-model',
    abortController: { abort: vi.fn() },
    runningSessionId: 'session-1',
    addToHistory,
    patchSession,
    pushSessionMessage,
    createSessionMessage,
    fs: {},
    tabState: { activeTabId: 'app.js', openTabs: [{ id: 'app.js', type: 'file' }] },
    editorState: { fileContents: {}, selectedLines: {} },
    sidebarState: { folderTree: [] },
    logState,
    ...overrides,
  };
}

describe('formatAgentEvent', () => {
  it('formats thinking, tool, observation, and finished events', () => {
    expect(formatAgentEvent({ type: 'thinking', turn: 1, agentRole: 'planner' })).toContain(
      'Planner',
    );
    expect(
      formatAgentEvent({
        type: 'tool',
        turn: 2,
        agentRole: 'coder',
        action: { action: 'read_file', path: 'a.js' },
      }),
    ).toContain('read_file');
    expect(formatAgentEvent({ type: 'observation', message: 'ok', agentRole: 'coder' })).toContain(
      'ok',
    );
    expect(formatAgentEvent({ type: 'observation', message: 'bad', error: true })).toContain('⚠');
    expect(
      formatAgentEvent({ type: 'finished', message: 'done', agentRole: 'reviewer' }),
    ).toContain('Ready for review');
    expect(formatAgentEvent({ type: 'unknown' })).toBe('');
  });

  it('prefers custom role labels from the graph map', () => {
    expect(
      formatAgentEvent({ type: 'thinking', turn: 1, agentRole: 'r1' }, { r1: 'Lead' }),
    ).toContain('Lead');
  });
});

describe('useAgentRunner', () => {
  it('does not send when prompt is empty', () => {
    const props = createRunnerProps({ val: '   ' });
    const { result } = renderHook(() => useAgentRunner(props));

    act(() => {
      result.current.send({ preventDefault: vi.fn() });
    });

    expect(props.patchSession).not.toHaveBeenCalled();
    expect(props.addToHistory).not.toHaveBeenCalled();
  });

  it('stops generation and clears running session state', async () => {
    const interruptWebLLM = vi.fn();
    vi.doMock('@/components/AI/WebLLMAPI', () => ({ interruptWebLLM }));

    const props = createRunnerProps({ isAIProcessing: true });
    const { result } = renderHook(() => useAgentRunner(props));

    await act(async () => {
      result.current.handleStop({ preventDefault: vi.fn() });
    });

    expect(props.abortController.abort).toHaveBeenCalled();
    expect(props.patchSession).toHaveBeenCalledWith('session-1', { status: 'idle', reasoning: '' });
    expect(props.pushSessionMessage).toHaveBeenCalled();
    expect(props.promptUiState).toHaveBeenCalled();
    expect(props.logState).toHaveBeenCalled();
  });
});
