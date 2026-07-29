import type { AgentEvent } from '@/components/AI/types';
import type { FormEvent, MouseEvent } from 'react';
import { makeAgentSession } from '@/test-utils/agentSessionMocks';
import { createMockEditorState, createMockTab } from '@/test-utils/editorMocks';
import { makeFileSystemApi } from '@/test-utils/fsMocks';
import {
  makeAgentSessionState,
  makeLogState,
  makePromptUiState,
  makeSidebarState,
  makeTabState,
} from '@/test-utils/stateMocks';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useAgentRunner, { formatAgentEvent } from './useAgentRunner';
import type { UseAgentRunnerParams } from './prompt-types';

const runAgent = vi.fn();
const runCollaborativeAgent = vi.fn();
const applyAgentChanges = vi.fn(() => ({ deletions: [], changeSet: null }));
const collectWorkspaceFiles = vi.fn(async (_fs, files) => files);

vi.mock('@/components/Workspace', () => ({
  ChangeSetState: { usePassiveState: () => ({}) },
  getWorkspaceIndex: () => ({ queryText: vi.fn().mockResolvedValue([]) }),
}));

vi.mock('@/components/AI/Agent', () => ({
  collectWorkspaceFiles,
  runAgent,
  runCollaborativeAgent,
  applyAgentChanges,
}));

vi.mock('@/utils/compiler', () => ({
  Compiler: vi.fn().mockImplementation(() => ({
    compile: vi.fn().mockResolvedValue(undefined),
    runProjectCheck: vi.fn().mockResolvedValue('ok'),
  })),
}));

vi.mock('@/components/App/Views/PreviewArea/previewEvidenceBridge', () => ({
  getLatestPreviewEvidence: vi.fn(() => null),
}));

function mockFormEvent(): FormEvent<Element> {
  return { preventDefault: vi.fn() } as unknown as FormEvent<Element>;
}

function mockMouseEvent(): MouseEvent<HTMLButtonElement> {
  return { preventDefault: vi.fn() } as unknown as MouseEvent<HTMLButtonElement>;
}

function createRunnerProps(overrides: Partial<UseAgentRunnerParams> = {}): UseAgentRunnerParams {
  const activeSession = makeAgentSession({
    id: 'session-1',
    name: 'Default',
    mode: 'single',
    roleGraph: null,
  });

  return {
    val: 'hello',
    isAIProcessing: false,
    activeSession,
    agentSessionState: makeAgentSessionState({
      activeSessionId: 'session-1',
      sessions: { 'session-1': activeSession },
    }),
    promptUiState: makePromptUiState(),
    promptScope: 'project',
    selectedModel: 'test-model',
    abortController: new AbortController(),
    runningSessionId: 'session-1',
    addToHistory: vi.fn(),
    patchSession: vi.fn(),
    pushSessionMessage: vi.fn(),
    createSessionMessage: vi.fn((message) => ({
      ...message,
      id: 1,
      timestamp: '2024-01-01T00:00:00.000Z',
    })),
    fs: makeFileSystemApi(),
    tabState: makeTabState({
      activeTabId: 'app.js',
      openTabs: [
        createMockTab({
          id: 'app.js',
          type: 'file',
          label: 'app.js',
          file: { name: 'app.js', path: ['app.js'] },
        }),
      ],
    }),
    editorState: createMockEditorState({ fileContents: {}, selectedLines: {} }),
    sidebarState: makeSidebarState({ folderTree: [] }),
    logState: makeLogState(),
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
    expect(
      formatAgentEvent({ type: 'observation', turn: 1, message: 'ok', agentRole: 'coder' }),
    ).toContain('ok');
    expect(
      formatAgentEvent({ type: 'observation', turn: 1, message: 'bad', error: true }),
    ).toContain('⚠');
    expect(
      formatAgentEvent({ type: 'finished', turn: 1, message: 'done', agentRole: 'reviewer' }),
    ).toContain('Ready for review');
    expect(formatAgentEvent({ type: 'unknown', turn: 0 } as unknown as AgentEvent)).toBe('');
  });

  it('formats tool actions without a target path', () => {
    expect(
      formatAgentEvent({
        type: 'tool',
        turn: 1,
        agentRole: 'coder',
        action: { action: 'search_workspace', query: 'auth flow' },
      }),
    ).toContain('search_workspace');
    expect(
      formatAgentEvent({
        type: 'tool',
        turn: 1,
        agentRole: 'custom',
        action: { action: 'list_files' },
      }),
    ).not.toContain(' — ');
  });

  it('uses the finished fallback message when summary is missing', () => {
    expect(formatAgentEvent({ type: 'finished', turn: 1, agentRole: 'coder' })).toContain(
      'Agent finished.',
    );
  });

  it('prefers custom role labels from the graph map', () => {
    expect(
      formatAgentEvent({ type: 'thinking', turn: 1, agentRole: 'r1' }, { r1: 'Lead' }),
    ).toContain('Lead');
  });
});

describe('useAgentRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runAgent.mockResolvedValue({
      summary: 'single done',
      changes: [{ path: 'app.js', before: 'a', after: 'b' }],
    });
    runCollaborativeAgent.mockResolvedValue({
      summary: 'team done',
      changes: [{ path: 'app.js', before: 'a', after: 'b' }],
    });
  });

  it('does not send when prompt is empty', () => {
    const props = createRunnerProps({ val: '   ' });
    const { result } = renderHook(() => useAgentRunner(props));

    act(() => {
      result.current.send(mockFormEvent());
    });

    expect(props.patchSession).not.toHaveBeenCalled();
    expect(props.addToHistory).not.toHaveBeenCalled();
  });

  it('sends an explicit welcome request with optional event and scope', () => {
    const props = createRunnerProps({ val: '', promptScope: 'file' });
    const { result } = renderHook(() => useAgentRunner(props));

    act(() => {
      result.current.send(null, 'welcome build', 'project');
    });

    expect(props.addToHistory).toHaveBeenCalledWith('welcome build');
    expect(props.patchSession).toHaveBeenCalled();
    expect(props.promptUiState).toHaveBeenCalled();
  });

  it('stops generation and clears running session state', async () => {
    const abort = vi.fn();
    const abortController = { abort } as unknown as AbortController;
    const props = createRunnerProps({ isAIProcessing: true, abortController });
    const { result } = renderHook(() => useAgentRunner(props));

    await act(async () => {
      result.current.handleStop(mockMouseEvent());
    });

    expect(abort).toHaveBeenCalled();
    expect(props.patchSession).toHaveBeenCalledWith('session-1', { status: 'idle', reasoning: '' });
    expect(props.pushSessionMessage).toHaveBeenCalled();
    expect(props.promptUiState).toHaveBeenCalled();
    expect(props.logState).toHaveBeenCalled();
  });

  it('runs team mode and file-scoped prompts with selected lines', async () => {
    const props = createRunnerProps({
      activeSession: makeAgentSession({
        id: 'session-1',
        name: 'Team',
        mode: 'team',
        roleGraph: { roles: [{ id: 'coder', label: 'Coder', kind: 'coder' }] },
        messages: [],
      }),
      promptScope: 'file',
      tabState: makeTabState({
        activeTabId: 'app.js',
        openTabs: [
          createMockTab({
            id: 'app.js',
            type: 'file',
            label: 'app.js',
            file: { name: 'app.js', path: ['app.js'] },
          }),
        ],
      }),
      editorState: createMockEditorState({
        fileContents: { 'app.js': 'code' },
        selectedLines: { 'app.js': [3, 4] },
      }),
    });
    const { result } = renderHook(() => useAgentRunner(props));

    act(() => {
      result.current.send(mockFormEvent());
    });

    await waitFor(() => {
      expect(runCollaborativeAgent).toHaveBeenCalled();
    });

    const options = runCollaborativeAgent.mock.calls[0][0];
    expect(options.scope).toBe('file');
    expect(options.activeFile).toBe('app.js');
    expect(options.selectedLines).toEqual([3, 4]);
    expect(props.pushSessionMessage).toHaveBeenCalled();
  });

  it('records agent failures and skips duplicate sends while processing', async () => {
    runAgent.mockRejectedValueOnce(new Error('model crashed'));
    const props = createRunnerProps();
    const { result, rerender } = renderHook((hookProps) => useAgentRunner(hookProps), {
      initialProps: props,
    });

    act(() => {
      result.current.send(mockFormEvent());
    });

    await waitFor(() => {
      expect(props.patchSession).toHaveBeenCalledWith('session-1', { status: 'error' });
    });

    const processingProps = createRunnerProps({ isAIProcessing: true });
    rerender(processingProps);
    act(() => {
      result.current.send(mockFormEvent());
    });
    expect(runAgent).toHaveBeenCalledTimes(1);
  });

  it('does not send without an active session', () => {
    const props = createRunnerProps({ activeSession: null });
    const { result } = renderHook(() => useAgentRunner(props));

    act(() => {
      result.current.send(mockFormEvent());
    });

    expect(runAgent).not.toHaveBeenCalled();
    expect(runCollaborativeAgent).not.toHaveBeenCalled();
  });
});
