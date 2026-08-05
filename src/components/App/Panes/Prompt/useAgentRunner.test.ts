import type { AgentEvent } from '@/components/AI/types';
import { AppState } from '@/components/App/AppState';
import { makeAgentSession } from '@/test-utils/agentSessionMocks';
import { createMockEditorState, createMockTab } from '@/test-utils/editorMocks';
import { makeFileSystemApi } from '@/test-utils/fsMocks';
import {
  makeAgentSessionState,
  makeAppState,
  makeLogState,
  makePromptUiState,
  makeSidebarState,
  makeTabState,
} from '@/test-utils/stateMocks';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FormEvent, MouseEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseAgentRunnerParams } from './prompt-types';
import useAgentRunner, { formatAgentEvent } from './useAgentRunner';

const {
  runAgent,
  runManager,
  runCollaborativeAgent,
  applyAgentChanges,
  collectWorkspaceFiles,
  ensureFileInTree,
  removeFileFromTree,
  createAIIncident,
} = vi.hoisted(() => {
  const runAgent = vi.fn();
  return {
    runAgent,
    runManager: runAgent,
    runCollaborativeAgent: vi.fn(),
    applyAgentChanges: vi.fn(() => ({ applied: 0, deletions: [], changeSet: null })),
    collectWorkspaceFiles: vi.fn(async (_fs: unknown, files: unknown) => files),
    ensureFileInTree: vi.fn(),
    removeFileFromTree: vi.fn(),
    createAIIncident: vi.fn(() => ({ id: 'incident-test' })),
  };
});

vi.mock('@/components/Workspace', () => ({
  ChangeSetState: { usePassiveState: () => ({}) },
  getWorkspaceIndex: () => ({ queryText: vi.fn().mockResolvedValue([]) }),
}));

vi.mock('@/components/App/AppState', () => ({
  AppState: { usePassiveState: vi.fn() },
}));

vi.mock('@/components/AI/Agent', () => ({
  collectWorkspaceFiles,
  runAgent,
  runManager,
  runCollaborativeAgent,
  applyAgentChanges,
  ensureFileInTree,
  removeFileFromTree,
  createAIIncident,
}));

vi.mock('@/components/AI/Agent/Applier', () => ({ applyAgentChanges }));
vi.mock('@/components/AI/Agent/ManagerRunner', () => ({ runManager }));
vi.mock('@/components/AI/Agent/Snapshot', () => ({ collectWorkspaceFiles }));
vi.mock('@/components/AI/Agent/AIIncident', () => ({ createAIIncident }));

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
    promptMode: 'ask',
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
      'planner',
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
      formatAgentEvent({
        type: 'observation',
        turn: 1,
        action: 'read_file',
        message: '42 characters returned',
      }),
    ).toContain('read_file');
    expect(
      formatAgentEvent({ type: 'observation', turn: 1, message: 'bad', error: true }),
    ).toContain('bad');
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
        agentRole: 'coder',
        action: {
          action: 'write_file',
          path: 'src/App.jsx',
          content: 'export default function App() { return null; }',
          reason: 'compose the page',
        },
      }),
    ).toContain('`write_file`');
    expect(
      formatAgentEvent({
        type: 'tool',
        turn: 2,
        action: { action: 'write_file', path: 'src/App.module.css', content: '.app {}' },
        provenance: 'recovery',
      }),
    ).toContain('`write_file`');
    expect(
      formatAgentEvent({
        type: 'tool',
        turn: 1,
        agentRole: 'custom',
        action: { action: 'list_files' },
      }),
    ).toContain('`list_files`');
  });

  it('keeps action targets in observation lines and lists changed files on completion', () => {
    expect(
      formatAgentEvent({
        type: 'observation',
        turn: 2,
        action: { action: 'read_file', path: 'src/App.jsx' },
        message: 'Read src/App.jsx (120 characters).',
      }),
    ).toContain('`read_file` completed');
    expect(
      formatAgentEvent({
        type: 'finished',
        turn: 3,
        message: 'Updated the page.',
        changes: [
          { path: 'src/App.jsx', after: 'next' },
          { path: 'src/App.module.css', after: 'next' },
        ],
      }),
    ).toContain('**Ready:** Updated the page.');
  });

  it('uses the finished fallback message when summary is missing', () => {
    expect(formatAgentEvent({ type: 'finished', turn: 1, agentRole: 'coder' })).toContain(
      'Agent finished.',
    );
  });

  it('keeps legacy role identifiers readable without role graph labels', () => {
    expect(formatAgentEvent({ type: 'thinking', turn: 1, agentRole: 'r1' })).toContain('r1');
  });

  it('shows the agent-provided thinking detail instead of a generic wait message', () => {
    expect(
      formatAgentEvent({
        type: 'thinking',
        turn: 1,
        agentRole: 'planner',
        message: 'Reviewing the workspace…',
      }),
    ).toContain('Reviewing the workspace');
  });
});

describe('useAgentRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AppState.usePassiveState).mockReturnValue(makeAppState());
    applyAgentChanges.mockReturnValue({ applied: 0, deletions: [], changeSet: null });
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

  it('stages a successful welcome request for review', async () => {
    applyAgentChanges.mockReturnValue({ applied: 1, deletions: [], changeSet: null });
    const props = createRunnerProps({
      editorState: createMockEditorState({
        fileContents: { 'src/App.jsx': 'starter app' },
        selectedLines: {},
      }),
      sidebarState: makeSidebarState({
        folderTree: [{ name: 'src', type: 'folder', path: ['src'], children: [] }],
      }),
    });
    const { result } = renderHook(() => useAgentRunner(props));

    act(() => {
      result.current.send(null, 'welcome build', 'project', true);
    });

    await waitFor(() => expect(applyAgentChanges).toHaveBeenCalled());
    expect(runManager.mock.calls[0][0]).toMatchObject({ mode: 'edit' });
    expect(
      (
        applyAgentChanges as unknown as {
          mock: { calls: Array<[unknown, Record<string, unknown>]> };
        }
      ).mock.calls[0][1],
    ).toMatchObject({ autoApprove: false });
    expect(props.patchSession).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        reasoning: expect.stringContaining('Welcome project staged'),
      }),
    );
  });

  it('records workspace filenames in the reasoning log', async () => {
    collectWorkspaceFiles.mockResolvedValueOnce({
      'package.json': '{}',
      'src/App.jsx': 'export default function App() { return null; }',
      'src/App.module.css': '.app {}',
    });
    const props = createRunnerProps();
    const { result } = renderHook(() => useAgentRunner(props));

    act(() => {
      result.current.send(mockFormEvent());
    });

    await waitFor(() => {
      const reasoningUpdates = vi
        .mocked(props.patchSession)
        .mock.calls.map(([, update]) => update.reasoning)
        .filter((reasoning): reasoning is string => typeof reasoning === 'string');
      expect(reasoningUpdates.some((reasoning) => reasoning.includes('`src/App.jsx`'))).toBe(true);
      expect(reasoningUpdates.some((reasoning) => reasoning.includes('`src/App.module.css`'))).toBe(
        true,
      );
    });
  });

  it('resets and aggregates current-run model metrics and tool calls', async () => {
    runAgent.mockImplementationOnce(async (options) => {
      options.onMetrics({
        requestKind: 'agent',
        requestedModelId: 'requested',
        modelId: 'fallback',
        outcome: 'success',
        startedAt: 0,
        totalMs: 250,
        timeToFirstTokenMs: 40,
        promptTokens: 12,
        completionTokens: 4,
        decodeTokensPerSecond: 20,
        recoveryCount: 0,
      });
      options.onEvent({ type: 'tool', turn: 1, action: { action: 'read_file', path: 'app.js' } });
      options.onEvent({ type: 'tool', turn: 2, action: { action: 'read_file', path: 'app.js' } });
      return { summary: 'done', changes: [] };
    });
    const props = createRunnerProps();
    const { result } = renderHook(() => useAgentRunner(props));

    act(() => {
      result.current.send(mockFormEvent());
    });

    await waitFor(() => {
      expect(props.patchSession).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          runUsage: expect.objectContaining({
            modelIds: ['fallback'],
            modelCalls: 1,
            promptTokens: 12,
            completionTokens: 4,
            toolCalls: { read_file: 2 },
          }),
        }),
      );
    });
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
    expect(props.patchSession).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ status: 'idle', reasoning: '', reasoningEvents: [] }),
    );
    expect(props.pushSessionMessage).toHaveBeenCalled();
    expect(props.promptUiState).toHaveBeenCalled();
    expect(props.logState).toHaveBeenCalled();
  });

  it('runs manager file-scoped prompts with selected lines', async () => {
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
      expect(runManager).toHaveBeenCalled();
    });

    const options = runManager.mock.calls[0][0];
    expect(options.scope).toBe('file');
    expect(options.activeFile).toBe('app.js');
    expect(options.selectedLines).toEqual([3, 4]);
    expect(props.pushSessionMessage).toHaveBeenCalled();
  });

  it('keeps the first prompt staged for review in an empty project', async () => {
    const props = createRunnerProps({
      editorState: createMockEditorState({ fileContents: {}, selectedLines: {} }),
      sidebarState: makeSidebarState({ folderTree: [] }),
    });
    const { result } = renderHook(() => useAgentRunner(props));

    act(() => {
      result.current.send(mockFormEvent());
    });

    await waitFor(() => {
      expect(applyAgentChanges).toHaveBeenCalled();
    });
    expect(
      (
        applyAgentChanges as unknown as {
          mock: { calls: Array<[unknown, Record<string, unknown>]> };
        }
      ).mock.calls[0][1],
    ).toMatchObject({ autoApprove: false });
  });

  it('does not build automatically after initial files are staged', async () => {
    const appState = makeAppState({ compileRequest: 0 });
    vi.mocked(AppState.usePassiveState).mockReturnValue(appState);
    applyAgentChanges.mockReturnValue({ applied: 1, deletions: [], changeSet: null });
    const props = createRunnerProps({
      editorState: createMockEditorState({ fileContents: {}, selectedLines: {} }),
      sidebarState: makeSidebarState({ folderTree: [] }),
    });
    const { result } = renderHook(() => useAgentRunner(props));

    act(() => {
      result.current.send(mockFormEvent());
    });

    await waitFor(() => expect(applyAgentChanges).toHaveBeenCalled());
    expect(appState.compileRequest).toBe(0);
  });

  it('keeps review enabled when the project already has files', async () => {
    const props = createRunnerProps({
      editorState: createMockEditorState({
        fileContents: { 'app.js': 'existing' },
        selectedLines: {},
      }),
    });
    const { result } = renderHook(() => useAgentRunner(props));

    act(() => {
      result.current.send(mockFormEvent());
    });

    await waitFor(() => {
      expect(applyAgentChanges).toHaveBeenCalled();
    });
    expect(
      (
        applyAgentChanges as unknown as {
          mock: { calls: Array<[unknown, Record<string, unknown>]> };
        }
      ).mock.calls[0][1],
    ).toMatchObject({ autoApprove: false });
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

  it('keeps generated changes transactional until the manager completes', async () => {
    runAgent.mockResolvedValueOnce({
      changes: [
        {
          path: 'src/components/Live.jsx',
          before: '',
          after: 'export default function Live() { return null; }',
        },
      ],
      summary: 'done',
    });

    const props = createRunnerProps();
    const { result } = renderHook(() => useAgentRunner(props));

    act(() => {
      result.current.send(mockFormEvent());
    });

    expect(props.editorState.fileContents?.['src/components/Live.jsx']).toBeUndefined();
    await waitFor(() => expect(applyAgentChanges).toHaveBeenCalled());
    expect(ensureFileInTree).not.toHaveBeenCalled();
    expect(removeFileFromTree).not.toHaveBeenCalled();
  });

  it('does not apply unreturned changes when the manager fails', async () => {
    runAgent.mockRejectedValueOnce(new Error('model crashed'));
    const props = createRunnerProps({
      editorState: createMockEditorState({
        fileContents: { 'src/App.jsx': 'export default () => null;' },
        selectedLines: {},
      }),
    });
    const { result } = renderHook(() => useAgentRunner(props));

    act(() => {
      result.current.send(mockFormEvent());
    });

    await waitFor(() =>
      expect(props.patchSession).toHaveBeenCalledWith('session-1', { status: 'error' }),
    );
    expect(applyAgentChanges).not.toHaveBeenCalled();
  });

  it('does not stage partial changes when the manager is cancelled', async () => {
    runAgent.mockRejectedValueOnce({
      code: 'cancelled',
      changes: [{ path: 'src/App.jsx', before: 'old', after: 'partial' }],
    });
    const props = createRunnerProps({
      editorState: createMockEditorState({
        fileContents: { 'src/App.jsx': 'old' },
        selectedLines: {},
      }),
    });
    const { result } = renderHook(() => useAgentRunner(props));

    act(() => {
      result.current.send(mockFormEvent());
    });

    await waitFor(() =>
      expect(props.patchSession).toHaveBeenCalledWith('session-1', { status: 'idle' }),
    );
    expect(applyAgentChanges).not.toHaveBeenCalled();
    expect(props.patchSession).not.toHaveBeenCalledWith('session-1', { status: 'error' });
    expect(props.createSessionMessage).toHaveBeenCalledTimes(1);
  });

  it('records manager routing and model progress as reasoning stages', async () => {
    runAgent.mockImplementationOnce(async (options) => {
      options.onEvent({
        type: 'routing',
        turn: 1,
        message: 'Request routed to edit.',
      });
      options.onEvent({
        type: 'model',
        turn: 1,
        message: 'Calling the model for generate-changes…',
      });
      return { changes: [], summary: 'done' };
    });
    const props = createRunnerProps();
    const { result } = renderHook(() => useAgentRunner(props));

    act(() => {
      result.current.send(mockFormEvent());
    });

    await waitFor(() => {
      const reasoningUpdates = vi
        .mocked(props.patchSession)
        .mock.calls.map(([, update]) => update.reasoning)
        .filter((reasoning): reasoning is string => typeof reasoning === 'string');
      expect(reasoningUpdates.some((reasoning) => reasoning.includes('Routing'))).toBe(true);
      expect(reasoningUpdates.some((reasoning) => reasoning.includes('Calling the model'))).toBe(
        true,
      );
    });
  });

  it('replaces transient model progress instead of accumulating heartbeat entries', async () => {
    runAgent.mockImplementationOnce(async (options) => {
      options.onEvent({
        type: 'model',
        turn: 1,
        message: 'Local model is still working (24s elapsed)…',
        replaceProgress: true,
      });
      options.onEvent({
        type: 'model',
        turn: 1,
        message: 'Local model is still working (27s elapsed)…',
        replaceProgress: true,
      });
      return { changes: [], summary: 'done' };
    });
    const props = createRunnerProps();
    const { result } = renderHook(() => useAgentRunner(props));

    act(() => {
      result.current.send(mockFormEvent());
    });

    await waitFor(() => {
      const reasoningUpdates = vi
        .mocked(props.patchSession)
        .mock.calls.map(([, update]) => update.reasoning)
        .filter((reasoning): reasoning is string => typeof reasoning === 'string');
      const latestReasoning = reasoningUpdates.at(-1) || '';
      expect(latestReasoning).toContain('27s elapsed');
      expect(latestReasoning).not.toContain('24s elapsed');
    });
  });
});
