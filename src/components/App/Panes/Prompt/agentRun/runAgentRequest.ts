import { applyAgentChanges } from '@/components/AI/Agent/Applier';
import type { AgentEvent, RunManagerOptions, RunManagerResult } from '@/components/AI/types';
import type { ExtendedEditorState } from '@/components/App/Views/EditorArea/types';
import type { FileSystemApi } from '@/components/App/types';
import { getWorkspaceIndex } from '@/components/Workspace';
import type {
  AgentSession,
  AppStateShape,
  ChangeSetStateShape,
  PreviewStateShape,
  PromptUiStateShape,
} from '@/types/domain-types';
import type {
  AgentSessionMessage,
  LogStateShape,
  SidebarStateShape,
  TabStateShape,
  WebLLMEngineState,
} from '@/types/domain-types';
import type { StateStore } from 'triactor';
import { createManagerToolOptions, prepareAgentRunContext } from './agentRunContext';
import { handleAgentRunError } from './agentRunErrors';
import { createAgentRunState } from './agentRunState';
import { formatAgentEvent } from './formatAgentEvent';

type SessionMessageFactory = (message: {
  role: string;
  text: string;
  agentRole?: string | null;
}) => AgentSessionMessage;

export type RunAgentRequestParams = {
  userMsg: string;
  sessionId: string;
  effectiveScope: string;
  isWelcomePrompt: boolean;
  autoApproveInitialProject: boolean;
  shouldAutoApprove: boolean;
  currentActiveTabId: string | null;
  currentActiveTab: TabStateShape['openTabs'][number] | undefined;
  fs: FileSystemApi;
  editorState: StateStore<ExtendedEditorState>;
  sidebarState: StateStore<SidebarStateShape>;
  tabState: StateStore<TabStateShape>;
  logState: StateStore<LogStateShape>;
  promptUiState: StateStore<PromptUiStateShape>;
  appState: StateStore<AppStateShape>;
  changeSetState: StateStore<ChangeSetStateShape>;
  previewState?: StateStore<PreviewStateShape> | null;
  selectedModel: string;
  cachedModelIds: string[];
  webLLMEngines: Record<string, WebLLMEngineState>;
  styleProfile?: import('@/components/AI/Agent/ProjectStyleProfile').ProjectStyleProfile;
  patchSession: (sessionId: string, patch: Partial<AgentSession>) => void;
  pushSessionMessage: (sessionId: string, message: AgentSessionMessage) => void;
  createSessionMessage: SessionMessageFactory;
};

export async function runAgentRequest({
  userMsg,
  sessionId,
  effectiveScope,
  isWelcomePrompt,
  autoApproveInitialProject,
  shouldAutoApprove,
  currentActiveTabId,
  currentActiveTab,
  fs,
  editorState,
  sidebarState,
  tabState,
  logState,
  promptUiState,
  appState,
  changeSetState,
  previewState,
  selectedModel,
  cachedModelIds,
  webLLMEngines,
  styleProfile,
  patchSession,
  pushSessionMessage,
  createSessionMessage,
}: RunAgentRequestParams): Promise<void> {
  const runState = createAgentRunState({
    sessionId,
    request: userMsg,
    patchSession,
    logState,
  });
  const controller = new AbortController();
  promptUiState((draft) => {
    draft.abortController = controller;
  });

  try {
    const selectedLines =
      (currentActiveTabId && editorState.selectedLines?.[currentActiveTabId]) || [];
    runState.appendReasoning(
      '**Routing request:** deciding which work belongs to tools and which needs the model…',
    );
    const { Compiler, workspaceFiles, preflightSummary } = await prepareAgentRunContext({
      fs,
      editorState,
      tabState,
      appState,
      appendReasoning: runState.appendReasoning,
    });
    const { runManager } = await import('@/components/AI/Agent/ManagerRunner');
    const manager = runManager as (options: RunManagerOptions) => Promise<RunManagerResult>;
    const result = await manager({
      request: userMsg,
      sessionId,
      priorContext: `Project preflight:\n${preflightSummary}`,
      scope: (effectiveScope === 'project' ? 'project' : 'file') as 'file' | 'project',
      activeFile:
        effectiveScope === 'file' && currentActiveTab?.type === 'file'
          ? currentActiveTabId
          : undefined,
      selectedLines: effectiveScope === 'file' ? selectedLines : [],
      files: workspaceFiles,
      model: selectedModel,
      styleProfile,
      signal: controller.signal,
      workspaceIndex: getWorkspaceIndex() as never,
      onMetrics: runState.recordMetrics,
      onRecovery: runState.recordRecovery,
      onTrace: (trace) => {
        runState.recordTrace(trace);
        promptUiState((draft) => {
          draft.latestManagerTrace = trace;
        });
      },
      ...createManagerToolOptions({
        Compiler,
        fs,
        sidebarState,
        tabState,
        previewState: previewState || undefined,
      }),
      onEvent: (managerEvent) => {
        if (managerEvent.type === 'validation') {
          const output = managerEvent.output || managerEvent.message || '';
          runState.recordValidation(
            /(?:"status"\s*:\s*"passed"|validation passed)/i.test(output)
              ? 'passed'
              : /(?:"status"\s*:\s*"failed"|validation failed)/i.test(output)
                ? 'failed'
                : 'unavailable',
          );
        }
        const legacyAction = managerEvent as unknown as AgentEvent;
        if (managerEvent.type === 'tool' || legacyAction.type === 'tool') {
          const tool =
            managerEvent.tool ||
            (typeof legacyAction.action === 'string'
              ? legacyAction.action
              : legacyAction.action?.action);
          if (tool) runState.recordTool(tool);
        }
        const line = formatAgentEvent(legacyAction);
        const isToolStart = managerEvent.type === 'tool' || legacyAction.type === 'tool';
        const isProgress = managerEvent.replaceProgress === true || isToolStart;
        if (line) runState.appendReasoning(line, isProgress);
        if (managerEvent.input || managerEvent.output) {
          runState.appendReasoning('', false, {
            turn: managerEvent.turn,
            input: managerEvent.input,
            output: managerEvent.output,
          });
        }
      },
    });

    let stillProcessing = false;
    logState((draft) => {
      stillProcessing = draft.isAIProcessing;
    });
    if (!stillProcessing) return;
    const {
      applied,
      deletions,
      changeSet,
      rejected = [],
    } = applyAgentChanges(result.changes, {
      editorState: editorState as never,
      sidebarState: sidebarState as never,
      logState: logState as never,
      changeSetState: changeSetState as never,
      request: userMsg,
      autoApprove: shouldAutoApprove,
    });
    const stagedAnything = applied > 0 || Boolean(changeSet) || deletions.length > 0;
    const applyFailed = rejected.length > 0 && (shouldAutoApprove || !stagedAnything);
    if (rejected.length) {
      runState.appendReasoning(
        applyFailed
          ? `**Apply rejected:** staged files were not written to the editor. ${rejected.join(' ')}`
          : `**Apply rejected:** omitted from the change set. ${rejected.join(' ')}`,
      );
    }

    const summaryText = applyFailed
      ? `[AI Manager]: Staged changes were not written to the editor. ${rejected.join(' ')}`
      : `[AI Manager]: ${result.summary || `Prepared ${result.changes.length} file(s) for review.`}`;
    runState.completeActivity(
      applyFailed ? 'error' : 'success',
      applyFailed
        ? `Staged changes were not written to the editor. ${rejected.join(' ')}`
        : result.summary || 'The manager finished successfully.',
    );
    patchSession(sessionId, { status: applyFailed ? 'error' : 'idle' });
    pushSessionMessage(sessionId, createSessionMessage({ role: 'ai', text: summaryText }));
    promptUiState((draft) => {
      draft.runningSessionId = null;
      draft.abortController = null;
    });
    logState((draft) => {
      draft.logs = [
        ...draft.logs,
        {
          id: Date.now() + 1,
          role: 'ai',
          text: summaryText,
          timestamp: new Date().toTimeString().split(' ')[0],
        },
      ];
      draft.isAIProcessing = false;
    });

    if (!applyFailed && (isWelcomePrompt || (autoApproveInitialProject && applied > 0))) {
      runState.appendReasoning(
        isWelcomePrompt
          ? '**Welcome project ready:** starting the first build now…'
          : '**Initial project ready:** starting the first build now…',
      );
      appState((draft) => {
        draft.compileRequest = (draft.compileRequest || 0) + 1;
      });
    }
    if (changeSet) {
      pushSessionMessage(
        sessionId,
        createSessionMessage({
          role: 'system',
          text: `Change set ${changeSet.id} is ready for review.`,
        }),
      );
    }
    if (deletions.length) {
      editorState((draft) => {
        const next = { ...(draft.pendingDeletions || {}) };
        for (const deletion of deletions) {
          next[deletion.path] = {
            originalContent: deletion.before,
            changeSetId: changeSet?.id || '',
          };
        }
        draft.pendingDeletions = next;
      });
    }
  } catch (error) {
    await handleAgentRunError({
      error,
      sessionId,
      userMsg,
      selectedModel,
      runMetrics: runState.runMetrics,
      runRecoveries: runState.runRecoveries,
      cachedModelIds,
      webLLMEngines,
      editorState,
      sidebarState,
      logState,
      changeSetState,
      promptUiState,
      patchSession,
      pushSessionMessage,
      createSessionMessage,
      completeActivity: runState.completeActivity,
    });
  }
}
