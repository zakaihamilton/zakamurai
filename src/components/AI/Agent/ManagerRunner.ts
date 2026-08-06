import { validateAIChanges } from '../ChangeValidator';
import type {
  ManagerEventHandler,
  ManagerModelCall,
  ManagerModelClient,
  ManagerToolName,
  ModelResult,
  RunManagerOptions,
  RunManagerResult,
  WebLLMGenerationMetrics,
  WebLLMMessage,
} from '../types';
import { AgentContextLedger, fingerprintWorkspace } from './AgentContextLedger';
import {
  contextText,
  extractPath,
  extractQuery,
  normalizeModelChanges,
  planIncludesTool,
  selectInitialContextFiles,
  summarizeToolResult,
} from './ManagerContextUtils';
import {
  MANAGER_SYSTEM_PROMPT,
  buildManagerModelPrompt,
  parseModelResult,
} from './ManagerProtocol';
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

const MAX_CONTEXT_ROUNDS = 3;
const MAX_REPAIR_ATTEMPTS = 2;
const AGENT_CONTEXT_WINDOW_SIZE = 4096;
const AGENT_GENERATION_TOKENS = 1800;
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
async function loadModel(): Promise<ManagerModelClient> {
  const { askWebLLM } = await import('../WebLLMAPI');
  return async ({
    model,
    messages,
    signal,
    onMetrics,
    onRecovery,
    temperature,
    top_p,
    max_tokens,
    contextWindowSize,
    sessionId,
  }: ManagerModelCall) =>
    askWebLLM('', '', null, {
      model,
      messages,
      signal,
      requestKind: 'agent',
      onMetrics,
      onRecovery,
      temperature,
      top_p,
      max_tokens,
      contextWindowSize,
      sessionId,
    });
}

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
  modelClient,
  recorder,
  onWorkspace,
}: ManagerExecutionOptions): Promise<ManagerExecutionResult> {
  if (signal?.aborted) throw new DOMException('Manager stopped', 'AbortError');
  const plan = createManagerPlan(request);
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
  const path = extractPath(request, scope === 'file' ? activeFile : null);
  if (path && Object.hasOwn(workspace.files, path)) await notifyTool('read_file', { path });
  else {
    const listed = await notifyTool('list_files', { query: '' });
    const listedPaths = Array.isArray(listed.value)
      ? listed.value.filter((item) => typeof item === 'string')
      : [];
    if (plan.intent === 'edit' || plan.intent === 'mixed') {
      for (const contextPath of selectInitialContextFiles(listedPaths, activeFile)) {
        if (contextPath !== path) await notifyTool('read_file', { path: contextPath });
      }
    }
    const query = extractQuery(request);
    if (query) await notifyTool('search_workspace', { query });
  }
  if (scope === 'file' && activeFile && selectedLines.length) {
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
    const actionContext = [handoffContext, contextText(toolResults)].filter(Boolean).join('\n\n');
    const actionResult = await runActionLoop({
      request,
      scope,
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
      visualMode: isLikelyUiRequest(request) || planIncludesTool(plan, 'inspect_preview'),
      requirePreviewInspection: planIncludesTool(plan, 'inspect_preview'),
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

  const askModel = modelClient || (await loadModel());
  const messages: WebLLMMessage[] = [{ role: 'system', content: MANAGER_SYSTEM_PROMPT }];
  let task: 'answer' | 'generate-changes' | 'repair-changes' =
    plan.intent === 'explanation' ? 'answer' : 'generate-changes';
  let result: ModelResult | null = null;
  let diagnostics = '';

  for (let round = 0; round < MAX_CONTEXT_ROUNDS; round++) {
    if (signal?.aborted) throw new DOMException('Manager stopped', 'AbortError');
    const prompt = buildManagerModelPrompt(request, contextText(toolResults), task, diagnostics);
    messages.push({ role: 'user', content: prompt });
    onEvent({
      type: 'model',
      turn: round + 1,
      task,
      message: `Calling the model for ${task}…`,
      input: prompt,
    });
    const reply = await askModel({
      model,
      messages,
      signal,
      task,
      onMetrics,
      temperature: 0.15,
      top_p: 0.8,
      max_tokens: task === 'answer' ? 1200 : AGENT_GENERATION_TOKENS,
      contextWindowSize: AGENT_CONTEXT_WINDOW_SIZE,
    });
    messages.push({ role: 'assistant', content: reply });
    onEvent({ type: 'model', turn: round + 1, task, output: reply });
    try {
      result = parseModelResult(reply);
      onEvent({ type: 'model', turn: round + 1, task, protocolStatus: 'valid' });
    } catch (error) {
      onEvent({
        type: 'model',
        turn: round + 1,
        task,
        error: true,
        protocolStatus: 'invalid',
        message: error instanceof Error ? error.message : String(error),
      });
      if (round === MAX_CONTEXT_ROUNDS - 1) throw error;
      diagnostics = `The previous model response was not valid manager JSON: ${
        error instanceof Error ? error.message : String(error)
      }. Return one valid JSON object matching the requested protocol.`;
      task = task === 'answer' ? 'answer' : 'generate-changes';
      continue;
    }
    if (
      task !== 'answer' &&
      (result.kind === 'answer' || (result.kind === 'changes' && result.changes.length === 0))
    ) {
      if (round === MAX_CONTEXT_ROUNDS - 1) {
        throw new Error('The model did not return changes for an edit request.');
      }
      diagnostics =
        'The previous model response did not return changes for an edit request. Return a kind=changes response with complete file contents.';
      task = task === 'repair-changes' ? 'repair-changes' : 'generate-changes';
      continue;
    }
    if (result.kind !== 'request-context') break;
    if (!result.requests.length) throw new Error('The model requested no usable context.');
    for (const requestContext of result.requests) {
      await notifyTool(requestContext.tool, requestContext.input || {});
    }
  }

  if (!result) throw new Error('The manager did not receive a model result.');
  if (task !== 'answer' && result.kind !== 'changes')
    throw new Error('The model did not return changes for an edit request.');
  if (result.kind === 'answer') {
    onEvent({ type: 'finished', turn: messages.length, message: result.summary });
    return {
      changes: [],
      files: workspace.files,
      summary: result.summary,
      plan,
      events: messages.length,
      workspace,
    };
  }
  let changes = normalizeModelChanges(result, workspace.files);
  if (!changes.length) throw new Error('The model did not return any changes.');

  for (let repair = 0; repair <= MAX_REPAIR_ATTEMPTS; repair++) {
    const validation = validateAIChanges(changes);
    if (validation.accepted.length && validation.rejected.length === 0) {
      for (const change of validation.accepted) {
        if (change.after === undefined) workspace.delete(change.path);
        else workspace.write(change.path, change.after);
      }
      if (validate) {
        const verification = await executeManagerTool({ tool: 'validate' }, tools);
        onEvent({
          type: 'validation',
          turn: repair + 1,
          message: 'Validating generated changes…',
          output: JSON.stringify(verification.value),
        });
        const status = (verification.value as { status?: string })?.status;
        const verificationMessage =
          verification.text || `Validation ${status || 'failed'} without diagnostics.`;
        if (status === 'failed' && repair < MAX_REPAIR_ATTEMPTS) {
          diagnostics = verificationMessage;
          task = 'repair-changes';
          toolResults.push(verification);
          const prompt = buildManagerModelPrompt(
            request,
            contextText(toolResults),
            task,
            diagnostics,
          );
          messages.push({ role: 'user', content: prompt });
          onEvent({
            type: 'model',
            turn: repair + 2,
            task,
            message: 'Calling the model for repair-changes…',
            input: prompt,
          });
          const reply = await askModel({
            model,
            messages,
            signal,
            task,
            onMetrics,
            onRecovery,
            temperature: 0.1,
            top_p: 0.8,
            max_tokens: AGENT_GENERATION_TOKENS,
            contextWindowSize: AGENT_CONTEXT_WINDOW_SIZE,
          });
          messages.push({ role: 'assistant', content: reply });
          onEvent({ type: 'model', turn: repair + 2, task, output: reply });
          try {
            result = parseModelResult(reply);
            onEvent({ type: 'model', turn: repair + 2, task, protocolStatus: 'valid' });
          } catch (error) {
            onEvent({
              type: 'model',
              turn: repair + 2,
              task,
              error: true,
              protocolStatus: 'invalid',
              message: error instanceof Error ? error.message : String(error),
            });
            diagnostics = `${verificationMessage}\nThe repair response was invalid: ${
              error instanceof Error ? error.message : String(error)
            }. Return a kind=changes response with complete file contents.`;
            changes = [];
            continue;
          }
          if (result.kind !== 'changes' || !result.changes.length) {
            diagnostics = `${verificationMessage}\nThe repair response did not return any changes. Return a kind=changes response with complete file contents.`;
            changes = [];
            continue;
          }
          changes = normalizeModelChanges(result, workspace.files);
          if (!changes.length) {
            diagnostics = `${verificationMessage}\nThe repair response did not contain usable changes. Return a kind=changes response with complete file contents.`;
            changes = [];
            continue;
          }
          continue;
        }
        if (status === 'failed') throw new Error(verificationMessage);
      }
      let previewSummary = '';
      if (planIncludesTool(plan, 'inspect_preview') && inspectPreview) {
        const preview = await notifyTool('inspect_preview');
        previewSummary = `\n\nPreview inspection:\n${summarizeToolResult(preview.tool, preview.value)}`;
      }
      const summary =
        (result.kind === 'changes' ? result.summary : '') ||
        `Prepared ${changes.length} file(s) for review.`;
      onEvent({ type: 'finished', turn: messages.length, message: summary });
      return {
        changes: workspace.changes(),
        files: workspace.files,
        summary: `${summary}${previewSummary}`,
        plan,
        events: messages.length,
        workspace,
      };
    }
    diagnostics = validation.rejected.length
      ? validation.rejected.join('\n')
      : diagnostics || 'The previous repair response did not provide usable changes.';
    if (repair >= MAX_REPAIR_ATTEMPTS) {
      throw new Error(diagnostics || 'The generated changes failed deterministic validation.');
    }
    task = 'repair-changes';
    const prompt = buildManagerModelPrompt(request, contextText(toolResults), task, diagnostics);
    messages.push({ role: 'user', content: prompt });
    const reply = await askModel({
      model,
      messages,
      signal,
      task,
      onMetrics,
      onRecovery,
      temperature: 0.1,
      top_p: 0.8,
      max_tokens: AGENT_GENERATION_TOKENS,
      contextWindowSize: AGENT_CONTEXT_WINDOW_SIZE,
    });
    messages.push({ role: 'assistant', content: reply });
    try {
      result = parseModelResult(reply);
      onEvent({ type: 'model', turn: messages.length, task, protocolStatus: 'valid' });
    } catch (error) {
      onEvent({
        type: 'model',
        turn: messages.length,
        task,
        error: true,
        protocolStatus: 'invalid',
        message: error instanceof Error ? error.message : String(error),
      });
      diagnostics = `The repair response was invalid: ${
        error instanceof Error ? error.message : String(error)
      }. Return a kind=changes response with complete file contents.`;
      changes = [];
      continue;
    }
    if (result.kind !== 'changes' || !result.changes.length) {
      diagnostics =
        'The repair response did not return any changes. Return a kind=changes response with complete file contents.';
      changes = [];
      continue;
    }
    changes = normalizeModelChanges(result, workspace.files);
    if (!changes.length) {
      diagnostics =
        'The repair response did not contain usable changes. Return a kind=changes response with complete file contents.';
      changes = [];
    }
  }
  throw new Error('The manager exhausted its repair attempts.');
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
