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
  runCollaborativeAgent,
  applyAgentChanges,
  collectWorkspaceFiles,
  ensureFileInTree,
  removeFileFromTree,
} = vi.hoisted(() => ({
  runAgent: vi.fn(),
  runCollaborativeAgent: vi.fn(),
  applyAgentChanges: vi.fn(() => ({ applied: 0, deletions: [], changeSet: null })),
  collectWorkspaceFiles: vi.fn(async (_fs: unknown, files: unknown) => files),
  ensureFileInTree: vi.fn(),
  removeFileFromTree: vi.fn(),
}));

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
  runCollaborativeAgent,
  applyAgentChanges,
  ensureFileInTree,
  removeFileFromTree,
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
      formatAgentEvent({
        type: 'observation',
        turn: 1,
        action: 'read_file',
        message: '42 characters returned',
      }),
    ).toContain('read_file');
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
        agentRole: 'coder',
        action: {
          action: 'write_file',
          path: 'src/App.jsx',
          content: 'export default function App() { return null; }',
          reason: 'compose the page',
        },
      }),
    ).toContain('file `src/App.jsx` · 46 characters · compose the page');
    expect(
      formatAgentEvent({
        type: 'tool',
        turn: 2,
        action: { action: 'write_file', path: 'src/App.module.css', content: '.app {}' },
        provenance: 'recovery',
      }),
    ).toContain('recovery write');
    expect(
      formatAgentEvent({
        type: 'tool',
        turn: 1,
        agentRole: 'custom',
        action: { action: 'list_files' },
      }),
    ).toContain('all workspace files');
  });

  it('keeps action targets in observation lines and lists changed files on completion', () => {
    expect(
      formatAgentEvent({
        type: 'observation',
        turn: 2,
        action: { action: 'read_file', path: 'src/App.jsx' },
        message: 'Read src/App.jsx (120 characters).',
      }),
    ).toContain('read_file` completed for file `src/App.jsx`');
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
    ).toContain('Changed files (2):** `src/App.jsx`, `src/App.module.css`');
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

  it('auto-approves the first prompt for an empty project', async () => {
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
    ).toMatchObject({ autoApprove: true });
  });

  it('builds and opens preview through the compile request after initial files are applied', async () => {
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

    await waitFor(() => expect(appState.compileRequest).toBe(1));
    expect(props.patchSession).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        reasoning: expect.stringContaining('Preview will open automatically'),
      }),
    );
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

  it('makes generated files viewable as live pending drafts during write_file events', async () => {
    runAgent.mockImplementationOnce(async (options) => {
      options.onEvent({
        type: 'tool',
        action: {
          action: 'write_file',
          path: 'src/components/Live.jsx',
          content: 'export default function Live() { return null; }',
        },
      });
      options.onEvent({
        type: 'tool',
        action: { action: 'delete_file', path: 'src/old.js' },
      });
      return { changes: [], summary: 'done' };
    });

    const props = createRunnerProps();
    const { result } = renderHook(() => useAgentRunner(props));

    act(() => {
      result.current.send(mockFormEvent());
    });

    await waitFor(() => {
      expect(ensureFileInTree).toHaveBeenCalledWith(props.sidebarState, 'src/components/Live.jsx');
      expect(removeFileFromTree).toHaveBeenCalledWith(props.sidebarState, 'src/old.js');
      expect(props.editorState.fileContents?.['src/components/Live.jsx']).toContain(
        'function Live',
      );
      expect(props.editorState.pendingDiffs?.['src/components/Live.jsx']).toMatchObject({
        originalContent: '',
        modifiedContent: 'export default function Live() { return null; }',
      });
    });
  });

  it('adds live drafts to review when the agent fails after writing', async () => {
    runAgent.mockImplementationOnce(async (options) => {
      options.onEvent({
        type: 'tool',
        action: {
          action: 'write_file',
          path: 'src/components/Live.jsx',
          content: 'export default function Live() { return null; }',
        },
      });
      throw new Error('model crashed');
    });
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

    await waitFor(() => {
      expect(applyAgentChanges).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            path: 'src/components/Live.jsx',
            before: '',
            after: 'export default function Live() { return null; }',
          }),
        ],
        expect.objectContaining({ autoApprove: false }),
      );
    });
  });

  it('replaces local-model progress updates instead of adding transcript lines', async () => {
    runAgent.mockImplementationOnce(async (options) => {
      options.onEvent({
        type: 'thinking',
        turn: 1,
        message: 'Local model is responding — streaming its next action…',
        replaceProgress: true,
      });
      options.onEvent({
        type: 'thinking',
        turn: 1,
        message: 'Local model is still working (48s elapsed; 2,703 character(s) received)…',
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
      const latestProgressUpdate = [...vi.mocked(props.patchSession).mock.calls]
        .reverse()
        .map(([, update]) => update.reasoningEvents)
        .find(
          (reasoningEvents) =>
            Array.isArray(reasoningEvents) &&
            reasoningEvents.some((entry) => entry.text.includes('48s elapsed')),
        );
      expect(latestProgressUpdate).toBeDefined();
      const progressEntries = (latestProgressUpdate ?? []).filter((entry) =>
        entry.text.includes('Local model is'),
      );
      expect(progressEntries).toHaveLength(1);
      expect(progressEntries[0]?.text).toContain('48s elapsed');
    });
  });
});
