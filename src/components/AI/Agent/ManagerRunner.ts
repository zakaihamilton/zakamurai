import {
  MAX_RELIABILITY_MODEL_CALLS,
  buildTaskContract,
  formatModelTask,
} from '../ReliabilityContracts';
import type {
  ManagerEventHandler,
  ManagerToolName,
  RunManagerOptions,
  RunManagerResult,
  WebLLMGenerationMetrics,
} from '../types';
import { AgentContextLedger, fingerprintWorkspace } from './AgentContextLedger';
import {
  contextText,
  extractPath,
  extractQuery,
  planIncludesTool,
  selectInitialContextFiles,
  summarizeToolResult,
} from './ManagerContextUtils';
import { runManagerDirectModelPath } from './ManagerDirectModel';
import { createManagerPlan, isLikelyUiRequest } from './ManagerRouter';
import {
  type ManagerToolResult,
  createManagerToolContext,
  executeManagerTool,
} from './ManagerTools';
import {
  type ManagerErrorCode,
  ManagerRunError,
  type ManagerTrace,
  ManagerTraceRecorder,
  classifyManagerError,
} from './ManagerTrace';
import {
  composeActionPriorContext,
  emitSmallModelHostGuidance,
  resolveSmallModelHostAssist,
} from './SmallModelHostAssist';

const contextLedgers = new Map<string, AgentContextLedger>();

const getContextLedger = (
  sessionId: string | undefined,
  modelId: string,
): AgentContextLedger | null => {
  if (!sessionId) return null;
  const key = `${sessionId}:${modelId}`;
  const existing = contextLedgers.get(key);
  if (existing) return existing;
  const ledger = new AgentContextLedger(sessionId, modelId);
  contextLedgers.set(key, ledger);
  return ledger;
};
type ManagerExecutionResult = Omit<RunManagerResult, 'trace'>;

type ManagerExecutionOptions = RunManagerOptions & {
  recorder: ManagerTraceRecorder;
  onWorkspace: (workspace: import('./Workspace').AgentWorkspace) => void;
};

async function executeManager({
  request,
  sessionId,
  scope = 'file',
  activeFile,
  selectedLines = [],
  files,
  model,
  validate,
  runProjectCheck,
  inspectPreview,
  retrieveContext,
  workspaceIndex = null,
  signal,
  onEvent = () => {},
  onMetrics,
  onRecovery,
  priorContext = '',
  styleProfile,
  seed,
  modelClient,
  recorder,
  onWorkspace,
}: ManagerExecutionOptions): Promise<ManagerExecutionResult> {
  if (signal?.aborted) throw new DOMException('Manager stopped', 'AbortError');
  const plan = createManagerPlan(request);
  const {
    profile: modelProfile,
    assessment: smallModelAssessment,
    effectiveScope,
  } = resolveSmallModelHostAssist(request, model, scope);
  const taskContract = buildTaskContract({
    request,
    scope: effectiveScope,
    activeFile,
    files,
  });
  const tools = createManagerToolContext(files, workspaceIndex, {
    validate,
    runProjectCheck,
    inspectPreview,
    retrieveContext,
  });
  const workspace = tools.workspace;
  onWorkspace(workspace);
  const ledger = getContextLedger(sessionId, model);
  ledger?.begin(request, workspace.files, fingerprintWorkspace(workspace.files));
  const handoffContext = [ledger?.summary(), priorContext].filter(Boolean).join('\n\n');
  const toolResults: ManagerToolResult[] = [];
  const notifyTool = async (tool: ManagerToolName, input: Record<string, unknown> = {}) => {
    if (signal?.aborted) throw new DOMException('Manager stopped', 'AbortError');
    onEvent({
      type: 'tool',
      turn: toolResults.length + 1,
      tool,
      message: `Running ${tool}…`,
      input: JSON.stringify(input),
    });
    const result = await executeManagerTool({ tool, input }, tools);
    toolResults.push(result);
    onEvent({
      type: 'context',
      turn: toolResults.length,
      tool,
      message: summarizeToolResult(tool, result.value).slice(0, 4000),
    });
    return result;
  };

  recorder.setPlan(plan);
  onEvent({ type: 'routing', turn: 0, plan, message: `Request routed to ${plan.intent}.` });
  onEvent({
    type: 'context',
    turn: 0,
    message: `Reliability contract: ${taskContract.requiredValidations.join(', ')}; model-call cap ${taskContract.maxModelCalls}; repair cap ${taskContract.maxRepairRounds}.`,
  });
  if (styleProfile) {
    onEvent({
      type: 'context',
      turn: 0,
      message: `Project style profile: ${styleProfile.source}; fingerprint ${styleProfile.fingerprint}.`,
    });
  }
  if (smallModelAssessment.guidance) {
    emitSmallModelHostGuidance(onEvent, smallModelAssessment);
  }

  if (!plan.modelRequired) {
    if (plan.intent === 'workspace-query') {
      const query = extractQuery(request);
      const readPath = extractPath(request);
      const isSearch = /\b(search|find|grep)\b/i.test(request);
      const result =
        readPath && /\b(?:read|open)\b/i.test(request)
          ? await notifyTool('read_file', { path: readPath })
          : isSearch
            ? await notifyTool('search_workspace', { query: query || request })
            : await notifyTool('list_files', { query: query || undefined });
      const summary = summarizeToolResult(result.tool, result.value);
      onEvent({ type: 'finished', turn: toolResults.length, message: summary });
      return {
        changes: [],
        files: workspace.files,
        summary,
        plan,
        events: toolResults.length,
        workspace,
      };
    }
    if (plan.intent === 'preview-inspection') {
      const result = await notifyTool('inspect_preview');
      const summary = summarizeToolResult(result.tool, result.value);
      onEvent({ type: 'finished', turn: toolResults.length, message: summary });
      return {
        changes: [],
        files: workspace.files,
        summary,
        plan,
        events: toolResults.length,
        workspace,
      };
    }
    const list = await notifyTool('list_project_checks');
    const checks = Array.isArray(list.value) ? list.value : [];
    if (/\b(?:which|what|list|show|available)\b.*\bchecks?\b/i.test(request)) {
      const summary = checks.length
        ? `Available project checks:\n${checks.join('\n')}`
        : 'No eligible project checks were found in package.json.';
      onEvent({ type: 'finished', turn: toolResults.length, message: summary });
      return {
        changes: [],
        files: workspace.files,
        summary,
        plan,
        events: toolResults.length,
        workspace,
      };
    }
    const check =
      checks.find((name) => request.toLowerCase().includes(String(name).toLowerCase())) ||
      checks[0];
    if (!check) {
      const summary = 'No eligible project checks were found in package.json.';
      onEvent({ type: 'finished', turn: toolResults.length, message: summary });
      return {
        changes: [],
        files: workspace.files,
        summary,
        plan,
        events: toolResults.length,
        workspace,
      };
    }
    const result = await notifyTool('run_project_check', { check, request });
    const summary = summarizeToolResult(result.tool, result.value);
    onEvent({ type: 'finished', turn: toolResults.length, message: summary });
    return {
      changes: [],
      files: workspace.files,
      summary,
      plan,
      events: toolResults.length,
      workspace,
    };
  }

  onEvent({
    type: 'context',
    turn: 0,
    message: 'Preparing bounded workspace context for the model…',
  });
  if (handoffContext)
    toolResults.push({
      tool: 'read_file',
      value: handoffContext,
      text: `[prior]\n${handoffContext}`,
    });
  const path = extractPath(request, effectiveScope === 'file' ? activeFile : null);
  if (path && Object.hasOwn(workspace.files, path)) await notifyTool('read_file', { path });
  else {
    const listed = await notifyTool('list_files', { query: '' });
    const listedPaths = Array.isArray(listed.value)
      ? listed.value.filter((item) => typeof item === 'string')
      : [];
    if (plan.intent === 'edit' || plan.intent === 'mixed') {
      for (const contextPath of selectInitialContextFiles(
        listedPaths,
        activeFile,
        modelProfile.maxContextFiles,
      )) {
        if (contextPath !== path) await notifyTool('read_file', { path: contextPath });
      }
    }
    const query = extractQuery(request);
    if (query) await notifyTool('search_workspace', { query });
  }
  if (effectiveScope === 'file' && activeFile && selectedLines.length) {
    await notifyTool('read_file', { path: activeFile });
  }

  if (plan.intent === 'edit' || plan.intent === 'mixed') {
    const { runActionLoop } = await import('./ActionLoop');
    const managerTools = new Set<ManagerToolName>([
      'list_files',
      'search_workspace',
      'search_semantic',
      'read_file',
      'validate',
      'list_project_checks',
      'run_project_check',
      'inspect_preview',
    ]);
    const actionContext = composeActionPriorContext({
      taskText: formatModelTask({
        kind: 'plan-edit',
        contract: taskContract,
        evidence: handoffContext,
      }),
      guidance: smallModelAssessment.guidance,
      handoffContext,
      toolContext: contextText(toolResults, modelProfile.maxContextChars),
    });
    const actionResult = await runActionLoop({
      request,
      scope: effectiveScope,
      activeFile,
      selectedLines,
      files,
      model,
      sessionId,
      validate,
      runProjectCheck,
      inspectPreview,
      retrieveContext,
      signal,
      onMetrics,
      priorContext: actionContext,
      workspace,
      workspaceIndex,
      modelClient,
      styleProfile,
      visualMode: isLikelyUiRequest(request) || planIncludesTool(plan, 'inspect_preview'),
      requirePreviewInspection: planIncludesTool(plan, 'inspect_preview'),
      maxTurns: MAX_RELIABILITY_MODEL_CALLS,
      seed,
      onEvent: (event) => {
        const action = event.action;
        const actionName = typeof action === 'string' ? action : action?.action;
        const tool =
          actionName && managerTools.has(actionName as ManagerToolName)
            ? (actionName as ManagerToolName)
            : undefined;
        if (event.type === 'model_io') {
          onEvent({
            type: 'model',
            turn: event.turn,
            task: 'generate-changes',
            input: event.input,
            output: event.output,
            message: 'Local model action exchange completed.',
            action,
            provenance: event.provenance,
          });
        } else if (event.type === 'tool') {
          onEvent({
            type: 'tool',
            turn: event.turn,
            tool,
            action,
            message: actionName ? `Running ${actionName}…` : event.message,
            provenance: event.provenance,
            error: event.error,
          });
        } else if (event.type === 'observation') {
          onEvent({
            type: 'context',
            turn: event.turn,
            tool,
            action,
            message: event.message,
            output: event.output,
            provenance: event.provenance,
            error: event.error,
          });
        } else if (event.type === 'finished') {
          onEvent({
            type: 'finished',
            turn: event.turn,
            action,
            message: event.message,
            provenance: event.provenance,
          });
        } else if (event.message) {
          onEvent({
            type: 'model',
            turn: event.turn,
            task: 'generate-changes',
            action,
            message: event.message,
            replaceProgress: event.replaceProgress,
            provenance: event.provenance,
          });
        }
      },
    });
    return {
      changes: actionResult.changes,
      files: actionResult.files,
      summary: actionResult.summary,
      plan,
      events: actionResult.events,
      workspace: actionResult.workspace,
    };
  }

  return runManagerDirectModelPath({
    request,
    model,
    plan,
    modelProfile,
    toolResults,
    tools,
    workspace,
    signal,
    onEvent,
    onMetrics,
    onRecovery,
    modelClient,
    seed,
    inspectPreview,
    notifyTool,
  });
}

export async function runManager(options: RunManagerOptions): Promise<RunManagerResult> {
  const recorder = new ManagerTraceRecorder(options.request);
  const workspaceHolder: { current: import('./Workspace').AgentWorkspace | null } = {
    current: null,
  };
  const emitTrace = (trace: ManagerTrace) => options.onTrace?.(trace);
  const onEvent: ManagerEventHandler = (managerEvent) => {
    options.onEvent?.(managerEvent);
    recorder.recordManagerEvent(managerEvent);
    emitTrace(recorder.snapshot());
  };
  const onMetrics = (metrics: WebLLMGenerationMetrics) => {
    options.onMetrics?.(metrics);
    recorder.record({
      phase: 'context',
      turn: 0,
      message: metrics.sessionState
        ? `Model context ${metrics.sessionState}; submitted ${metrics.submittedDeltaTokens || 0} delta token(s).`
        : undefined,
      sessionState: metrics.sessionState,
      submittedDeltaBytes: metrics.submittedDeltaBytes,
      submittedDeltaTokens: metrics.submittedDeltaTokens,
      reusedContextTokens: metrics.reusedContextTokens,
    });
    emitTrace(recorder.snapshot());
  };

  try {
    const result = await executeManager({
      ...options,
      onEvent,
      onMetrics,
      recorder,
      onWorkspace: (nextWorkspace) => {
        workspaceHolder.current = nextWorkspace;
      },
    });
    const ledger = getContextLedger(options.sessionId, options.model);
    if (ledger) {
      ledger.record(`Completed: ${result.summary}`);
      ledger.record(
        result.changes.length
          ? `Changed files: ${result.changes.map((change) => change.path).join(', ')}`
          : 'No files changed.',
      );
      ledger.updateFiles(
        result.files,
        result.changes.map((change) => change.path),
      );
      ledger.setPendingReview(result.changes.length > 0);
    }
    const trace = recorder.finish('success');
    emitTrace(trace);
    return { ...result, trace };
  } catch (error) {
    const code: ManagerErrorCode = classifyManagerError(error);
    const trace = recorder.finish(code === 'cancelled' ? 'aborted' : 'error', code);
    emitTrace(trace);
    if (error instanceof ManagerRunError) throw error;
    throw new ManagerRunError(error instanceof Error ? error.message : String(error), {
      code,
      phase: code === 'cancelled' ? 'error' : 'error',
      trace,
      changes: workspaceHolder.current ? workspaceHolder.current.changes() : [],
      cause: error,
    });
  }
}
