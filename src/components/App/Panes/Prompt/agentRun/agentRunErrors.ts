import { applyAgentChanges } from '@/components/AI/Agent/Applier';
import type {
  AgentChange,
  WebLLMGenerationMetrics,
  WebLLMRecoveryEvent,
} from '@/components/AI/types';
import type { ExtendedEditorState } from '@/components/App/Views/EditorArea/types';
import type {
  ChangeSetStateShape,
  PromptUiStateShape,
  WebLLMEngineState,
} from '@/types/domain-types';
import type { AgentSessionMessage, LogStateShape, SidebarStateShape } from '@/types/domain-types';
import type { AgentSession } from '@/types/domain-types';
import type { StateStore } from 'triactor';

type SessionMessageFactory = (message: {
  role: string;
  text: string;
  agentRole?: string | null;
}) => AgentSessionMessage;

type ErrorContext = {
  error: unknown;
  sessionId: string;
  userMsg: string;
  selectedModel: string;
  runMetrics: WebLLMGenerationMetrics[];
  runRecoveries: WebLLMRecoveryEvent[];
  cachedModelIds: string[];
  webLLMEngines: Record<string, WebLLMEngineState>;
  editorState: StateStore<ExtendedEditorState>;
  sidebarState: StateStore<SidebarStateShape>;
  logState: StateStore<LogStateShape>;
  changeSetState: StateStore<ChangeSetStateShape>;
  promptUiState: StateStore<PromptUiStateShape>;
  patchSession: (sessionId: string, patch: Partial<AgentSession>) => void;
  pushSessionMessage: (sessionId: string, message: AgentSessionMessage) => void;
  createSessionMessage: SessionMessageFactory;
};

export const isCancelledError = (error: unknown): boolean =>
  error != null &&
  typeof error === 'object' &&
  'code' in error &&
  (error as { code?: unknown }).code === 'cancelled';

const applyPendingDeletions = (
  editorState: StateStore<ExtendedEditorState>,
  deletions: Array<{ path: string; before: string }>,
  changeSetId: string,
) => {
  if (!deletions.length) return;
  editorState((draft) => {
    const next = { ...(draft.pendingDeletions || {}) };
    for (const deletion of deletions) {
      next[deletion.path] = {
        originalContent: deletion.before,
        changeSetId,
      };
    }
    draft.pendingDeletions = next;
  });
};

export async function handleAgentRunError({
  error,
  sessionId,
  userMsg,
  selectedModel,
  runMetrics,
  runRecoveries,
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
}: ErrorContext): Promise<'cancelled' | 'failed'> {
  if (isCancelledError(error)) {
    patchSession(sessionId, { status: 'idle' });
    promptUiState((draft) => {
      draft.runningSessionId = null;
      draft.abortController = null;
    });
    logState((draft) => {
      draft.isAIProcessing = false;
    });
    return 'cancelled';
  }

  const managerError =
    error &&
    typeof error === 'object' &&
    'changes' in error &&
    Array.isArray((error as { changes?: unknown }).changes)
      ? (error as { changes: AgentChange[] })
      : null;
  const { createAIIncident } = await import(
    /* webpackChunkName: "ai-incident" */ '@/components/AI/Agent/AIIncident'
  );
  const incident = createAIIncident({
    error,
    trace:
      error && typeof error === 'object' && 'trace' in error
        ? (error as { trace?: import('@/components/AI/Agent/ManagerTrace').ManagerTrace }).trace ||
          null
        : null,
    selectedModelId: selectedModel,
    metrics: runMetrics,
    recoveries: runRecoveries,
    cachedModelIds,
    engines: webLLMEngines,
    stagedChangeCount: managerError?.changes.length || 0,
  });
  promptUiState((draft) => {
    draft.latestAIIncident = incident;
  });

  if (managerError?.changes.length) {
    const { deletions, changeSet } = applyAgentChanges(managerError.changes, {
      editorState: editorState as never,
      sidebarState: sidebarState as never,
      logState: logState as never,
      changeSetState: changeSetState as never,
      request: userMsg,
      autoApprove: false,
    });
    if (changeSet) {
      pushSessionMessage(
        sessionId,
        createSessionMessage({
          role: 'system',
          text: `Partial change set ${changeSet.id} is ready for review after the manager stopped with an error.`,
        }),
      );
    }
    applyPendingDeletions(editorState, deletions, changeSet?.id || '');
  }

  const message = `AI Manager error: ${error instanceof Error ? error.message : String(error)}`;
  logState((draft) => {
    if (!draft.isAIProcessing) return;
    draft.logs = [
      ...draft.logs,
      {
        id: Date.now(),
        role: 'ai',
        text: message,
        timestamp: new Date().toTimeString().split(' ')[0],
      },
    ];
    draft.isAIProcessing = false;
  });
  pushSessionMessage(sessionId, createSessionMessage({ role: 'ai', text: message }));
  patchSession(sessionId, { status: 'error' });
  promptUiState((draft) => {
    draft.runningSessionId = null;
    draft.abortController = null;
  });
  return 'failed';
}
