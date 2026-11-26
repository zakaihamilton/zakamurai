import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAgentChanges, removeFileFromTree } from '@/components/AI/Agent/Applier';
import { runManager } from '@/components/AI/Agent/ManagerRunner';
import type { ManagerTrace } from '@/components/AI/Agent/ManagerTrace';
import type {
  AgentChange,
  FileMap,
  RunManagerOptions,
  WebLLMGenerationMetrics,
  WebLLMRecoveryEvent,
} from '@/components/AI/types';
import { createMockEditorState, createMockTab } from '@/test-utils/editorMocks';
import { makeFileSystemApi } from '@/test-utils/fsMocks';
import {
  makeAppState,
  makeChangeSetState,
  makeLogState,
  makePreviewState,
  makePromptUiState,
  makeSidebarState,
  makeTabState,
} from '@/test-utils/stateMocks';
import type { AgentSessionMessage } from '@/types/domain-types';
import { createManagerToolOptions, prepareAgentRunContext } from './agentRunContext';
import { handleAgentRunError } from './agentRunErrors';
import { type RunAgentRequestParams, runAgentRequest } from './runAgentRequest';

const {
  mockRunManager,
  mockApplyAgentChanges,
  mockRemoveFileFromTree,
  mockPrepareAgentRunContext,
  mockCreateManagerToolOptions,
  mockHandleAgentRunError,
  mockGetWorkspaceIndex,
} = vi.hoisted(() => ({
  mockRunManager: vi.fn(),
  mockApplyAgentChanges: vi.fn(),
  mockRemoveFileFromTree: vi.fn(),
  mockPrepareAgentRunContext: vi.fn(),
  mockCreateManagerToolOptions: vi.fn(),
  mockHandleAgentRunError: vi.fn(),
  mockGetWorkspaceIndex: vi.fn(() => ({ queryText: vi.fn() })),
}));

vi.mock('@/components/AI/Agent/ManagerRunner', () => ({
  runManager: mockRunManager,
}));

vi.mock('@/components/AI/Agent/Applier', () => ({
  applyAgentChanges: mockApplyAgentChanges,
  removeFileFromTree: mockRemoveFileFromTree,
}));

vi.mock('@/components/Workspace', () => ({
  getWorkspaceIndex: mockGetWorkspaceIndex,
}));

vi.mock('./agentRunContext', () => ({
  prepareAgentRunContext: mockPrepareAgentRunContext,
  createManagerToolOptions: mockCreateManagerToolOptions,
}));

vi.mock('./agentRunErrors', () => ({
  handleAgentRunError: mockHandleAgentRunError,
}));

function makeParams(overrides: Partial<RunAgentRequestParams> = {}): RunAgentRequestParams {
  return {
    userMsg: 'Build a counter',
    sessionId: 'session-1',
    effectiveScope: 'project',
    isWelcomePrompt: false,
    autoApproveInitialProject: false,
    shouldAutoApprove: false,
    currentActiveTabId: 'src/App.jsx',
    currentActiveTab: createMockTab({
      id: 'src/App.jsx',
      type: 'file',
      label: 'App.jsx',
      file: { name: 'App.jsx', path: ['src', 'App.jsx'] },
    }),
    fs: makeFileSystemApi({ mode: 'sandbox' }),
    editorState: createMockEditorState({
      fileContents: { 'src/App.jsx': 'export default function App() {}' },
      pendingDiffs: {},
      pendingDeletions: {},
      dirtyBufferContents: {},
      selectedLines: { 'src/App.jsx': [1, 5] },
    }),
    sidebarState: makeSidebarState({ folderTree: [] }),
    tabState: makeTabState({
      openTabs: [
        createMockTab({
          id: 'src/App.jsx',
          type: 'file',
          label: 'App.jsx',
        }),
      ],
      activeTabId: 'src/App.jsx',
      lastCodeTabId: 'src/App.jsx',
    }),
    logState: makeLogState({ isAIProcessing: true, logs: [] }),
    promptUiState: makePromptUiState({ runningSessionId: 'session-1' }),
    appState: makeAppState({ workspaceEpoch: 1, compileRequest: 0, silentCompileRequest: 0 }),
    changeSetState: makeChangeSetState(),
    previewState: makePreviewState({
      htmlContent: '<html>old</html>',
      isCompilerReady: true,
      previewAddress: '/preview/old.html',
      restoreError: null,
      compileError: null,
      serverError: null,
    }),
    selectedModel: 'test-model',
    cachedModelIds: ['test-model'],
    webLLMEngines: {},
    patchSession: vi.fn(),
    pushSessionMessage: vi.fn(),
    createSessionMessage: vi.fn(
      (msg): AgentSessionMessage => ({
        ...msg,
        id: 1,
        timestamp: '12:00:00',
      }),
    ),
    ...overrides,
  };
}

describe('runAgentRequest', () => {
  let capturedOnPreviewInspection:
    | ((stagedFiles: FileMap, inspection: unknown) => void)
    | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnPreviewInspection = undefined;

    mockPrepareAgentRunContext.mockResolvedValue({
      Compiler: vi.fn(),
      workspaceFiles: { 'src/App.jsx': 'export default function App() {}' },
      preflightSummary: 'No project preflight issues detected.',
    });

    mockCreateManagerToolOptions.mockImplementation(
      (opts: {
        onPreviewInspection?: (stagedFiles: FileMap, inspection: unknown) => void;
        isWorkspaceCurrent?: () => boolean;
      }) => {
        capturedOnPreviewInspection = opts.onPreviewInspection;
        return {
          onPreviewInspection: opts.onPreviewInspection,
          isWorkspaceCurrent: opts.isWorkspaceCurrent,
          validate: vi.fn(),
          runProjectCheck: vi.fn(),
          inspectPreview: vi.fn(),
          retrieveContext: vi.fn(),
        };
      },
    );

    mockRunManager.mockResolvedValue({
      summary: 'Updated counter',
      changes: [{ path: 'src/App.jsx', before: 'a', after: 'b' }] as AgentChange[],
    });

    mockApplyAgentChanges.mockReturnValue({
      applied: 1,
      deletions: [],
      changeSet: { id: 'cs-1' },
    });

    mockHandleAgentRunError.mockResolvedValue('failed');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes file-scoped options, selectedLines, deduplicated overlay paths, and completes review run', async () => {
    const params = makeParams({
      effectiveScope: 'file',
      appState: makeAppState({ workspaceEpoch: undefined as unknown as number }),
      editorState: createMockEditorState({
        fileContents: { 'src/App.jsx': 'base' },
        pendingDiffs: {
          'src/App.jsx': { originalContent: 'a', modifiedContent: 'b', diffs: [] },
        },
        pendingDeletions: { 'src/Old.jsx': { originalContent: 'old', changeSetId: 'cs-old' } },
        dirtyBufferContents: { 'src/App.jsx': 'dirty', 'src/Extra.jsx': 'extra' },
        selectedLines: { 'src/App.jsx': [2, 8] },
      }),
    });

    await runAgentRequest(params);

    expect(prepareAgentRunContext).toHaveBeenCalledTimes(1);
    expect(createManagerToolOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        baselineDeletedPaths: ['src/Old.jsx'],
        baselineOverlayPaths: ['src/App.jsx', 'src/Extra.jsx'],
      }),
    );
    const toolOpts = mockCreateManagerToolOptions.mock.calls[0][0];
    expect(toolOpts.isWorkspaceCurrent()).toBe(false);
    expect(runManager).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'file',
        activeFile: 'src/App.jsx',
        selectedLines: [2, 8],
        model: 'test-model',
      }),
    );
    expect(applyAgentChanges).toHaveBeenCalled();
    expect(params.patchSession).toHaveBeenCalledWith('session-1', { status: 'idle' });
    expect(params.pushSessionMessage).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ role: 'ai', text: '[AI Manager]: Updated counter' }),
    );
    expect(params.pushSessionMessage).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        role: 'system',
        text: 'Change set cs-1 is ready for review.',
      }),
    );
    expect(params.promptUiState.runningSessionId).toBeNull();
    expect(params.promptUiState.abortController).toBeNull();
    expect(params.logState.isAIProcessing).toBe(false);
    expect(params.logState.logs).toHaveLength(1);
  });

  it('clears activeFile and selectedLines in project scope or non-file active tab', async () => {
    const params = makeParams({
      effectiveScope: 'file',
      currentActiveTabId: 'preview',
      currentActiveTab: createMockTab({ id: 'preview', type: 'preview', label: 'Preview' }),
      previewState: null,
      appState: makeAppState({ workspaceEpoch: 2 }),
    });
    mockRunManager.mockResolvedValueOnce({
      summary: '',
      changes: [{ path: 'a.js' }, { path: 'b.js' }],
    });
    mockApplyAgentChanges.mockReturnValueOnce({
      applied: 0,
      deletions: [],
      changeSet: null,
      rejected: undefined,
    });

    await runAgentRequest(params);

    const managerOptions = mockRunManager.mock.calls[0][0] as RunManagerOptions;
    expect(managerOptions.scope).toBe('file');
    expect(managerOptions.activeFile).toBeUndefined();
    expect(managerOptions.selectedLines).toEqual([]);
    expect(params.pushSessionMessage).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        text: '[AI Manager]: Prepared 2 file(s) for review.',
      }),
    );
  });

  it('records metrics, recoveries, traces, and all validation/tool/context event variants when workspace is current, and ignores them when epoch changes', async () => {
    const params = makeParams({
      appState: makeAppState({ workspaceEpoch: 5 }),
    });
    const metrics: WebLLMGenerationMetrics = {
      requestKind: 'agent',
      requestedModelId: 'req-m',
      modelId: 'm1',
      outcome: 'success',
      startedAt: 0,
      totalMs: 100,
      recoveryCount: 0,
    };
    const recovery: WebLLMRecoveryEvent = {
      requestedModelId: 'req-m',
      modelId: 'm1',
      phase: 'generation',
      action: 'retry',
      reason: 'stalled',
      attempt: 1,
    };
    const trace: ManagerTrace = {
      version: 1,
      runId: 'r1',
      request: 'Build a counter',
      startedAt: 0,
      outcome: 'success',
      events: [],
    };

    mockRunManager.mockImplementationOnce(async (opts: RunManagerOptions) => {
      opts.onMetrics?.(metrics);
      opts.onRecovery?.(recovery);
      opts.onTrace?.(trace);

      // Validation events: structured JSON and prose variants
      opts.onEvent?.({
        type: 'validation',
        turn: 1,
        output: '{"status": "PASSED"}',
        message: 'ok',
      });
      opts.onEvent?.({
        type: 'context',
        turn: 1,
        tool: 'validate',
        output: 'validation check failed badly',
      });
      opts.onEvent?.({
        type: 'context',
        turn: 1,
        action: 'validate',
        message: 'validation could not run due to setup',
      });
      opts.onEvent?.({
        type: 'context',
        turn: 1,
        action: { action: 'validate' },
        output: 'build validation done',
      });
      opts.onEvent?.({
        type: 'context',
        turn: 1,
        output: 'build validation passed cleanly',
      });

      // Tool events: tool prop, string action, object action, no tool name, input/output metadata
      opts.onEvent?.({
        type: 'tool',
        turn: 2,
        tool: 'read_file',
        message: 'Read App.jsx',
        input: 'src/App.jsx',
        output: 'code',
      });
      opts.onEvent?.({
        type: 'tool',
        turn: 2,
        action: 'list_files',
      });
      opts.onEvent?.({
        type: 'tool',
        turn: 2,
        action: { action: 'search_workspace' },
      });
      opts.onEvent?.({
        type: 'tool',
        turn: 2,
      });
      // Empty formatted line event
      opts.onEvent?.({
        type: 'unknown' as 'model',
        turn: 3,
        message: '',
        replaceProgress: true,
      });

      // Change workspaceEpoch -> subsequent callbacks must be ignored
      params.appState.workspaceEpoch = 6;
      opts.onMetrics?.(metrics);
      opts.onRecovery?.(recovery);
      opts.onTrace?.({ ...trace, runId: 'stale' });
      opts.onEvent?.({ type: 'tool', turn: 4, tool: 'read_file' });
      // Restore epoch so post-run steps execute normally
      params.appState.workspaceEpoch = 5;

      return { summary: 'done', changes: [] };
    });

    await runAgentRequest(params);

    expect(params.promptUiState.latestManagerTrace).toEqual(trace);
    const runUsageCalls = vi
      .mocked(params.patchSession)
      .mock.calls.map(([, patch]) => patch.runUsage)
      .filter(Boolean);
    const lastUsage = runUsageCalls.at(-1);
    expect(lastUsage?.modelCalls).toBe(1);
    expect(lastUsage?.finalValidationStatus).toBe('passed');
    expect(lastUsage?.toolCalls).toEqual({
      read_file: 1,
      list_files: 1,
      search_workspace: 1,
    });
  });

  it('restores preview and returns early when processing was already stopped before runManager resolves', async () => {
    const params = makeParams({
      tabState: makeTabState({
        openTabs: [createMockTab({ id: 'src/App.jsx', type: 'file', label: 'App.jsx' })],
        activeTabId: 'src/App.jsx',
      }),
      previewState: makePreviewState({
        htmlContent: '<html>original</html>',
        isCompilerReady: false,
        previewAddress: '/preview/original.html',
        restoreError: 'r-err',
        compileError: 'c-err',
        serverError: 's-err',
      }),
    });

    mockRunManager.mockImplementationOnce(async () => {
      // Simulate preview tab and state mutated during run and user clicking Stop
      params.tabState((draft) => {
        draft.openTabs = [
          ...draft.openTabs,
          createMockTab({ id: 'preview', type: 'preview', label: 'Preview' }),
        ];
      });
      params.previewState?.((draft) => {
        draft.htmlContent = '<html>temp</html>';
        draft.isCompilerReady = true;
      });
      params.logState((draft) => {
        draft.isAIProcessing = false;
      });
      return { summary: 'done', changes: [] };
    });

    await runAgentRequest(params);

    expect(applyAgentChanges).not.toHaveBeenCalled();
    expect(params.tabState.openTabs.map((t) => t.id)).toEqual(['src/App.jsx']);
    expect(params.previewState?.htmlContent).toBe('<html>original</html>');
    expect(params.previewState?.isCompilerReady).toBe(false);
    expect(params.previewState?.previewAddress).toBe('/preview/original.html');
    expect(params.previewState?.restoreError).toBe('r-err');
    expect(params.previewState?.compileError).toBe('c-err');
    expect(params.previewState?.serverError).toBe('s-err');
  });

  it('keeps newly opened preview tab during restorePreview if it was already present or currently active, and handles null previewState on restore', async () => {
    const params = makeParams({
      previewState: null,
      tabState: makeTabState({
        openTabs: [createMockTab({ id: 'preview', type: 'preview', label: 'Preview' })],
        activeTabId: 'preview',
      }),
    });

    mockRunManager.mockImplementationOnce(async () => {
      params.logState((draft) => {
        draft.isAIProcessing = false;
      });
      return { summary: 'done', changes: [] };
    });

    await runAgentRequest(params);
    expect(params.tabState.openTabs.map((t) => t.id)).toEqual(['preview']);
  });

  it('handles auto-approved deletions by removing editor state, tree entries, and matching/nested tabs', async () => {
    const params = makeParams({
      shouldAutoApprove: true,
      tabState: makeTabState({
        openTabs: [
          createMockTab({ id: 'src/Keep.jsx', type: 'file', label: 'Keep.jsx' }),
          createMockTab({ id: 'src/Old', type: 'file', label: 'Old' }),
          createMockTab({ id: 'src/Old/Child.jsx', type: 'file', label: 'Child.jsx' }),
        ],
        activeTabId: 'src/Old/Child.jsx',
        lastCodeTabId: 'src/Old',
      }),
      editorState: createMockEditorState({
        fileContents: { 'src/Old': 'x', 'src/Keep.jsx': 'k' },
      }),
    });
    mockApplyAgentChanges.mockReturnValueOnce({
      applied: 1,
      deletions: [{ path: 'src/Old', before: 'old code' }],
      changeSet: null,
    });

    await runAgentRequest(params);

    expect(removeFileFromTree).toHaveBeenCalledWith(params.sidebarState, 'src/Old');
    expect(params.editorState.fileContents).toEqual({ 'src/Keep.jsx': 'k' });
    expect(params.tabState.openTabs.map((t) => t.id)).toEqual(['src/Keep.jsx']);
    expect(params.tabState.activeTabId).toBe('src/Keep.jsx');
    expect(params.tabState.lastCodeTabId).toBe('src/Keep.jsx');
  });

  it('sets activeTabId to null when auto-approved deletion removes all open tabs, and records pendingDeletions in review mode', async () => {
    const autoParams = makeParams({
      shouldAutoApprove: true,
      tabState: makeTabState({
        openTabs: [createMockTab({ id: 'src/App.jsx', type: 'file', label: 'App.jsx' })],
        activeTabId: 'src/App.jsx',
      }),
    });
    mockApplyAgentChanges.mockReturnValueOnce({
      applied: 1,
      deletions: [{ path: 'src/App.jsx', before: 'before-1' }],
      changeSet: null,
    });

    await runAgentRequest(autoParams);
    expect(autoParams.tabState.openTabs).toEqual([]);
    expect(autoParams.tabState.activeTabId).toBeNull();

    const autoKeepActiveParams = makeParams({
      shouldAutoApprove: true,
      tabState: makeTabState({
        openTabs: [
          createMockTab({ id: 'src/Keep.jsx', type: 'file', label: 'Keep.jsx' }),
          createMockTab({ id: 'src/App.jsx', type: 'file', label: 'App.jsx' }),
        ],
        activeTabId: 'src/Keep.jsx',
      }),
    });
    mockApplyAgentChanges.mockReturnValueOnce({
      applied: 1,
      deletions: [{ path: 'src/App.jsx', before: 'before-2' }],
      changeSet: null,
    });

    await runAgentRequest(autoKeepActiveParams);
    expect(autoKeepActiveParams.tabState.activeTabId).toBe('src/Keep.jsx');

    const reviewParams = makeParams({
      shouldAutoApprove: false,
      editorState: createMockEditorState({
        pendingDeletions: undefined as unknown as Record<string, never>,
      }),
    });
    mockApplyAgentChanges.mockReturnValueOnce({
      applied: 0,
      deletions: [{ path: 'src/Del.jsx', before: 'before-del' }],
      changeSet: null,
    });

    await runAgentRequest(reviewParams);
    expect(reviewParams.editorState.pendingDeletions).toEqual({
      'src/Del.jsx': { originalContent: 'before-del', changeSetId: '' },
    });
  });

  it('handles partial vs full rejections, restores preview on failure, and skips compile on failure', async () => {
    const failedAutoParams = makeParams({
      shouldAutoApprove: true,
      isWelcomePrompt: true,
      previewState: makePreviewState({ htmlContent: '<html>safe</html>' }),
    });
    mockRunManager.mockImplementationOnce(async () => {
      failedAutoParams.previewState?.((d) => {
        d.htmlContent = '<html>mutated</html>';
      });
      return { summary: 'done', changes: [] };
    });
    mockApplyAgentChanges.mockReturnValueOnce({
      applied: 1,
      deletions: [],
      changeSet: null,
      rejected: ['Bad syntax.'],
    });

    await runAgentRequest(failedAutoParams);

    expect(failedAutoParams.previewState?.htmlContent).toBe('<html>safe</html>');
    expect(failedAutoParams.appState.compileRequest).toBe(0);
    expect(failedAutoParams.patchSession).toHaveBeenCalledWith('session-1', { status: 'error' });
    expect(failedAutoParams.patchSession).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        reasoning: expect.stringContaining('staged files were not written to the editor'),
      }),
    );

    const partialReviewParams = makeParams({
      shouldAutoApprove: false,
    });
    mockApplyAgentChanges.mockReturnValueOnce({
      applied: 0,
      deletions: [{ path: 'src/Del.jsx', before: 'old' }],
      changeSet: { id: 'cs-partial' },
      rejected: ['Skipped one file.'],
    });

    await runAgentRequest(partialReviewParams);
    expect(partialReviewParams.patchSession).toHaveBeenCalledWith('session-1', { status: 'idle' });
    expect(partialReviewParams.patchSession).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        reasoning: expect.stringContaining('omitted from the change set'),
      }),
    );
  });

  it('reuses validated preview when staged files match snapshot and triggers rebuild when preview files differ or fail', async () => {
    const files = { 'src/App.jsx': 'export default function App() {}' };

    // Case 1: matching preview inspection on welcome prompt -> silentCompileRequest
    const reuseParams = makeParams({
      isWelcomePrompt: true,
      editorState: createMockEditorState({ fileContents: files }),
    });
    mockRunManager.mockImplementationOnce(async () => {
      capturedOnPreviewInspection?.(files, { status: 'passed' });
      return { summary: 'done', changes: [] };
    });

    await runAgentRequest(reuseParams);
    expect(reuseParams.appState.silentCompileRequest).toBe(1);
    expect(reuseParams.appState.compileRequest).toBe(0);

    // Case 2: mismatched preview inspection (extra file / different content) on non-welcome prompt -> previewNeedsRebuild -> compileRequest
    const rebuildParams = makeParams({
      isWelcomePrompt: false,
      autoApproveInitialProject: false,
      editorState: createMockEditorState({ fileContents: files }),
    });
    mockRunManager.mockImplementationOnce(async () => {
      capturedOnPreviewInspection?.({ 'src/App.jsx': 'different content' }, { status: 'passed' });
      return { summary: 'done', changes: [] };
    });

    await runAgentRequest(rebuildParams);
    expect(rebuildParams.appState.compileRequest).toBe(1);
    expect(rebuildParams.appState.silentCompileRequest).toBe(0);
    expect(rebuildParams.patchSession).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        reasoning: expect.stringContaining('Initial project ready'),
      }),
    );

    // Case 3: failed inspection resets previewInspectionFiles -> no compile when not welcome/initial
    const failedInspectParams = makeParams({
      isWelcomePrompt: false,
      autoApproveInitialProject: false,
      editorState: createMockEditorState({ fileContents: files }),
    });
    mockRunManager.mockImplementationOnce(async () => {
      capturedOnPreviewInspection?.(files, { status: 'passed' });
      capturedOnPreviewInspection?.(files, { status: 'failed' });
      return { summary: 'done', changes: [] };
    });

    await runAgentRequest(failedInspectParams);
    expect(failedInspectParams.appState.compileRequest).toBe(0);
    expect(failedInspectParams.appState.silentCompileRequest).toBe(0);

    // Case 4: autoApproveInitialProject && applied > 0 -> compileRequest
    const initialParams = makeParams({
      isWelcomePrompt: false,
      autoApproveInitialProject: true,
      editorState: createMockEditorState({ fileContents: files }),
    });
    mockApplyAgentChanges.mockReturnValueOnce({
      applied: 2,
      deletions: [],
      changeSet: null,
    });
    await runAgentRequest(initialParams);
    expect(initialParams.appState.compileRequest).toBe(1);
  });

  it('restores preview and delegates to handleAgentRunError on failure in same workspace, and aborts silently if epoch changed', async () => {
    const error = new Error('manager failed');
    const sameEpochParams = makeParams({
      appState: makeAppState({ workspaceEpoch: 3 }),
      previewState: makePreviewState({ htmlContent: '<html>before</html>' }),
    });
    mockRunManager.mockImplementationOnce(async () => {
      sameEpochParams.previewState?.((d) => {
        d.htmlContent = '<html>broken</html>';
      });
      throw error;
    });

    await runAgentRequest(sameEpochParams);

    expect(sameEpochParams.previewState?.htmlContent).toBe('<html>before</html>');
    expect(handleAgentRunError).toHaveBeenCalledWith(
      expect.objectContaining({
        error,
        sessionId: 'session-1',
        userMsg: 'Build a counter',
        selectedModel: 'test-model',
      }),
    );

    vi.clearAllMocks();
    const staleEpochParams = makeParams({
      appState: makeAppState({ workspaceEpoch: 3 }),
      previewState: makePreviewState({ htmlContent: '<html>before</html>' }),
    });
    mockRunManager.mockImplementationOnce(async () => {
      staleEpochParams.previewState?.((d) => {
        d.htmlContent = '<html>new-workspace</html>';
      });
      staleEpochParams.appState.workspaceEpoch = 4;
      throw error;
    });

    await runAgentRequest(staleEpochParams);

    expect(staleEpochParams.previewState?.htmlContent).toBe('<html>new-workspace</html>');
    expect(handleAgentRunError).not.toHaveBeenCalled();
  });
});
