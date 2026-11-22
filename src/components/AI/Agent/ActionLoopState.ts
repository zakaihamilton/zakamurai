import type {
  AgentEventHandler,
  FileMap,
  RunAgentOptions,
  RunAgentResult,
  TaskContract,
  WebLLMMessage,
} from '@/components/AI/types';
import { workspaceFulfillsInteractiveRequest } from '../ChangeValidator';
import { MAX_RELIABILITY_MODEL_CALLS, buildTaskContract } from '../ReliabilityContracts';
import { AgentExecutionError } from './ActionLoopErrors';
import { createAutoFinishContextReadyWrite } from './ActionLoopFastPath';
import { type PreviewInspectLoopState, createInspectPreviewForLoop } from './ActionLoopInspect';
import {
  createAutoFinishSummary,
  loadAskWebLLM,
  recoverDeferredSource,
} from './ActionLoopRecovery';
import { createActionLoopOpening } from './ActionLoopSession';
import { recoverWorkspaceCssModules } from './ActionLoopUtils';
import { type ActionLoopValidationState, createValidationRunner } from './ActionLoopValidation';
import { AgentContextManager } from './ContextManager';
import { type ProjectStyleProfile, projectStyleRecoveryTrace } from './ProjectStyleProfile';
import { AGENT_SYSTEM_PROMPT, ALL_AGENT_ACTIONS, type parseAgentAction } from './Protocol';
import { AgentWorkspace } from './Workspace';

export type ActionLoopAction = NonNullable<ReturnType<typeof parseAgentAction>>;

export type ActionLoopStepOutcome =
  | { kind: 'proceed' }
  | { kind: 'continue' }
  | { kind: 'return'; result: RunAgentResult };

export interface ActionLoopState {
  request: string;
  activeFile?: string | null;
  model: string;
  sessionId?: string;
  validate?: RunAgentOptions['validate'];
  executeProjectCheck?: RunAgentOptions['runProjectCheck'];
  inspectPreview?: RunAgentOptions['inspectPreview'];
  retrieveContext?: RunAgentOptions['retrieveContext'];
  signal?: AbortSignal;
  onEvent: AgentEventHandler;
  onMetrics?: RunAgentOptions['onMetrics'];
  maxTurns: number;
  agentRole: string | null;
  visualMode: boolean;
  modelClient?: RunAgentOptions['modelClient'];
  modelSession?: RunAgentOptions['modelSession'];
  seed?: number;
  askWebLLM: Awaited<ReturnType<typeof loadAskWebLLM>> | null;
  workspace: AgentWorkspace;
  taskContract: TaskContract;
  context: AgentContextManager;
  lightweightModel: boolean;
  modularGeneration: boolean;
  contextReady: boolean;
  hostAssistedWrite: boolean;
  enforceFulfillment: boolean;
  hostAssistedSession: boolean;
  effectiveAllowedActions: RunAgentOptions['allowedActions'];
  lightweightTargetPath: string;
  resolvedStyleProfile?: ProjectStyleProfile;
  messages: WebLLMMessage[];
  previewInspectionRequired: boolean;
  modularOutputRecoveryMessage: string;
  protocolFailures: number;
  modularOutputFailures: number;
  lastFingerprint: string;
  repeatedActions: number;
  lastSuccessfulFingerprint: string;
  validationState: ActionLoopValidationState;
  previewInspectState: PreviewInspectLoopState;
  recoveredNoOpWrite: string;
  finishAfterAutomaticValidation: boolean;
  automaticValidationResult: string;
  failedWritePath: string;
  failedWriteContent: string;
  failedWriteDiagnostic: string;
  forcedWriteRecoveryPending: boolean;
  forcedRecoveryTargetPath: string | null;
  forcedWriteRecoveryViolations: number;
  directChangesRecoveryPending: boolean;
  deferredSourceWrite: { path: string; content: string; stylesheets: string[] } | null;
  lastReadContents: Map<string, string>;
  unchangedReadSkips: number;
  nonProductiveActionsWithoutWrite: number;
  directRepairAttempts: number;
  incompleteWriteRetries: number;
  declarationRepairAttempts: number;
  failedWriteAttempts: number;
  malformedSourceAttempts: number;
  failedStylesheetWrites: Map<string, number>;
  nonProductiveActionLimit: number;
  forcedRecoveryViolationLimit: number;
  incompleteWriteRetryLimit: number;
  failedWriteAttemptLimit: number;
  malformedSourceAttemptLimit: number;
  validationRepairLimit: number;
  runValidation: ReturnType<typeof createValidationRunner>;
  inspectPreviewForLoop: ReturnType<typeof createInspectPreviewForLoop>;
  finishContextReadyWrite: ReturnType<typeof createAutoFinishContextReadyWrite>;
}

export const recordFailedWriteAttempt = (state: ActionLoopState, target: string): void => {
  state.failedWriteAttempts += 1;
  if (state.failedWriteAttempts < state.failedWriteAttemptLimit) return;
  throw new AgentExecutionError(
    `The local model repeatedly failed to write valid source for ${target} (${state.failedWriteAttempts} attempts with incomplete or non-code content). Staged changes were preserved for review; retry with a stronger model or a narrower request.`,
    state.workspace.changes(),
  );
};

export const clearFailedWriteAttempts = (state: ActionLoopState): void => {
  state.failedWriteAttempts = 0;
  state.incompleteWriteRetries = 0;
};

export const markWorkspaceMutated = (state: ActionLoopState): void => {
  state.previewInspectState.inspectedPreview = false;
  state.previewInspectState.previewInspectionAccepted = false;
  state.previewInspectState.lastPreviewResult = '';
  state.finishAfterAutomaticValidation = false;
  state.automaticValidationResult = '';
  state.validationState.wroteSinceVerification = true;
  state.nonProductiveActionsWithoutWrite = 0;
  state.unchangedReadSkips = 0;
};

export const stageRecoveredWrite = (
  state: ActionLoopState,
  turn: number,
  path: string,
  content: string,
): void => {
  state.workspace.write(path, content);
  state.onEvent({
    type: 'tool',
    turn,
    action: { action: 'write_file', path, content },
    agentRole: state.agentRole,
    provenance: 'recovery',
  });
};

export const stageDeferredRecovery = (
  state: ActionLoopState,
  source: { path: string; content: string },
  turn: number,
  action: ActionLoopAction,
): string | null => {
  const recovery = recoverDeferredSource({
    source,
    files: state.workspace.files,
    request: state.request,
    lightweight: state.lightweightModel,
    turn,
    action,
    agentRole: state.agentRole,
    onEvent: state.onEvent,
    fulfills: workspaceFulfillsInteractiveRequest,
  });
  if (!recovery) return null;
  state.failedWritePath = recovery.path;
  state.failedWriteContent = recovery.content;
  state.failedWriteDiagnostic = recovery.diagnostic;
  state.forcedWriteRecoveryPending = true;
  return recovery.diagnostic;
};

export const applyCssModuleRecovery = (state: ActionLoopState, turn: number): string[] => {
  const recovered = recoverWorkspaceCssModules(state.workspace.files, state.resolvedStyleProfile);
  for (const { path, content } of recovered) stageRecoveredWrite(state, turn, path, content);
  const trace = projectStyleRecoveryTrace(
    state.workspace.files,
    recovered.map(({ path }) => path),
    state.resolvedStyleProfile,
  );
  if (trace) state.context.record('style_recovery', trace);
  return recovered.map((entry) => entry.path);
};

export const autoFinishSummary = (
  state: ActionLoopState,
  reason: 'validate' | 'fulfillment' | 'identical-write' | 'unchanged-reads' | 'safety-limit',
  wiredEntry: string | null,
): string =>
  createAutoFinishSummary(state.request)(
    reason,
    wiredEntry,
    state.validationState.lastValidationStatus,
  );

export async function createActionLoopState({
  request,
  scope = 'file',
  activeFile,
  selectedLines = [],
  files,
  model,
  sessionId,
  validate,
  runProjectCheck: executeProjectCheck,
  inspectPreview,
  retrieveContext,
  signal,
  onEvent = () => {},
  onMetrics,
  maxTurns = MAX_RELIABILITY_MODEL_CALLS,
  systemPrompt = AGENT_SYSTEM_PROMPT,
  allowedActions = ALL_AGENT_ACTIONS,
  priorContext = '',
  workspace: existingWorkspace = null,
  agentRole = null,
  workspaceIndex = null,
  visualMode = false,
  requirePreviewInspection = false,
  modelClient,
  modelSession,
  styleProfile,
  seed,
}: RunAgentOptions): Promise<ActionLoopState> {
  const askWebLLM = modelClient ? null : await loadAskWebLLM();
  const workspace = existingWorkspace || new AgentWorkspace(files, workspaceIndex);
  const taskContract = buildTaskContract({ request, scope, activeFile, files });
  const context = new AgentContextManager({ request, priorContext });
  const {
    lightweightModel,
    modularGeneration,
    contextReady,
    hostAssistedWrite,
    enforceFulfillment,
    hostAssistedSession,
    effectiveAllowedActions,
    lightweightTargetPath,
    resolvedStyleProfile,
    messages,
  } = createActionLoopOpening({
    request,
    scope,
    activeFile,
    selectedLines,
    files: workspace.files as FileMap,
    model,
    priorContext,
    agentRole,
    systemPrompt,
    allowedActions,
    visualMode,
    styleProfile,
    conversationContext: context.toString(),
  });
  const previewInspectionRequired = requirePreviewInspection && Boolean(inspectPreview);
  const validationState: ActionLoopValidationState = {
    wroteSinceVerification: false,
    lastValidationFailed: false,
    lastValidationStatus: 'unavailable',
    repairAttempts: 0,
  };
  const previewInspectState: PreviewInspectLoopState = {
    inspectedPreview: false,
    previewInspectionAccepted: false,
    lastPreviewResult: '',
  };
  // Manager context permits only one redundant inspection before forcing a write.
  const nonProductiveActionLimit = contextReady ? 1 : lightweightModel ? 2 : 4;
  // Lightweight models stay on fence-only recovery longer.
  const forcedRecoveryViolationLimit = lightweightModel ? 4 : 2;
  const incompleteWriteRetryLimit = lightweightModel ? 3 : 2;
  // Incomplete metadata ↔ prose oscillation has a bounded retry budget.
  const failedWriteAttemptLimit = lightweightModel ? 5 : 6;
  const malformedSourceAttemptLimit = lightweightModel ? 3 : 4;
  const validationRepairLimit = taskContract.maxRepairRounds;

  const state: ActionLoopState = {
    request,
    activeFile,
    model,
    sessionId,
    validate,
    executeProjectCheck,
    inspectPreview,
    retrieveContext,
    signal,
    onEvent,
    onMetrics,
    maxTurns,
    agentRole,
    visualMode,
    modelClient,
    modelSession,
    seed,
    askWebLLM,
    workspace,
    taskContract,
    context,
    lightweightModel,
    modularGeneration,
    contextReady,
    hostAssistedWrite,
    enforceFulfillment,
    hostAssistedSession,
    effectiveAllowedActions,
    lightweightTargetPath,
    resolvedStyleProfile,
    messages,
    previewInspectionRequired,
    modularOutputRecoveryMessage:
      'For this new app, a single action or source fence is not accepted. Return the complete app entry, its CSS Module, up to two src/components/ subcomponents, and each component CSS Module as path-labelled fences in one response.',
    protocolFailures: 0,
    modularOutputFailures: 0,
    lastFingerprint: '',
    repeatedActions: 0,
    lastSuccessfulFingerprint: '',
    validationState,
    previewInspectState,
    recoveredNoOpWrite: '',
    finishAfterAutomaticValidation: false,
    automaticValidationResult: '',
    failedWritePath: '',
    failedWriteContent: '',
    failedWriteDiagnostic: '',
    forcedWriteRecoveryPending: false,
    forcedRecoveryTargetPath: null,
    forcedWriteRecoveryViolations: 0,
    directChangesRecoveryPending: false,
    deferredSourceWrite: null,
    lastReadContents: new Map<string, string>(),
    unchangedReadSkips: 0,
    nonProductiveActionsWithoutWrite: 0,
    directRepairAttempts: 0,
    incompleteWriteRetries: 0,
    declarationRepairAttempts: 0,
    failedWriteAttempts: 0,
    malformedSourceAttempts: 0,
    failedStylesheetWrites: new Map<string, number>(),
    nonProductiveActionLimit,
    forcedRecoveryViolationLimit,
    incompleteWriteRetryLimit,
    failedWriteAttemptLimit,
    malformedSourceAttemptLimit,
    validationRepairLimit,
    runValidation: null as unknown as ReturnType<typeof createValidationRunner>,
    inspectPreviewForLoop: null as unknown as ReturnType<typeof createInspectPreviewForLoop>,
    finishContextReadyWrite: null as unknown as ReturnType<
      typeof createAutoFinishContextReadyWrite
    >,
  };

  state.runValidation = createValidationRunner({
    workspace,
    validate,
    onEvent,
    agentRole,
    context,
    state: validationState,
    validationRepairLimit,
  });
  state.inspectPreviewForLoop = createInspectPreviewForLoop({
    state: previewInspectState,
    files: workspace.files,
    inspectPreview,
    previewInspectionRequired,
    resolvedStyleProfile,
    applyCssModuleRecovery: (turn) => applyCssModuleRecovery(state, turn),
    context,
    onEvent,
    agentRole,
  });
  state.finishContextReadyWrite = createAutoFinishContextReadyWrite({
    request,
    workspace,
    lightweightTargetPath,
    visualMode,
    previewInspectionRequired,
    previewInspectState,
    applyCssModuleRecovery: (turn) => applyCssModuleRecovery(state, turn),
    inspectPreviewForLoop: state.inspectPreviewForLoop,
    hasValidation: Boolean(validate),
    runValidation: state.runValidation,
    validationState,
    onEvent,
    agentRole,
    context,
  });

  return state;
}
