import { validateAIChanges } from '../ChangeValidator';
import type {
  AgentChange,
  ManagerEventHandler,
  ManagerModelCall,
  ManagerModelClient,
  ManagerToolName,
  ModelResult,
  RunManagerOptions,
  RunManagerResult,
  WebLLMMessage,
} from '../types';
import {
  MANAGER_SYSTEM_PROMPT,
  buildManagerModelPrompt,
  parseModelResult,
} from './ManagerProtocol';
import { createManagerPlan } from './ManagerRouter';
import {
  type ManagerToolResult,
  createManagerToolContext,
  executeManagerTool,
  formatContextResults,
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

const summarizeToolResult = (tool: ManagerToolName, value: unknown): string => {
  if (tool === 'list_files' && Array.isArray(value))
    return `Found ${value.length} workspace file(s).\n${value.join('\n')}`;
  if (tool === 'validate' && value && typeof value === 'object') {
    const result = value as { status?: string; diagnostics?: string; output?: string };
    return `${result.status || 'unknown'}${result.diagnostics ? `\n${result.diagnostics}` : result.output ? `\n${result.output}` : ''}`;
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
};

const extractQuery = (request: string): string => {
  const listDirectory = request.match(
    /\b(?:list|show)\b.*\bfiles?\b.*\b(?:in|under|within)\s+(?:the\s+)?[`'“”`]?((?:[\w.-]+\/)*[\w.-]+)[`'“”`]?\s*$/i,
  )?.[1];
  if (listDirectory && !/^(?:workspace|project|repository|repo)$/i.test(listDirectory)) {
    return `${listDirectory.replace(/\/+$/, '')}/`;
  }
  const quoted = request.match(/["'“”`]([^"'“”`]+)["'“”`]/)?.[1];
  if (quoted) return quoted;
  return request
    .replace(/\b(?:please|search|find|grep|show|list|files?|for|in|the|workspace|src)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const planIncludesTool = (plan: ReturnType<typeof createManagerPlan>, tool: ManagerToolName) =>
  plan.steps.some((step) => step.kind === 'tool' && step.tool === tool);

const extractPath = (request: string, activeFile?: string | null): string | null => {
  const quoted = request.match(/["'“”`]([^"'“”`]+)["'“”`]/)?.[1];
  const path = request.match(
    /(?:^|\s)((?:[\w.-]+\/)*[\w.-]+\.(?:json|jsx?|tsx?|css|html|md|txt)\b)/i,
  )?.[1];
  if (quoted && !quoted.includes('/') && !/\.[a-z0-9]+$/i.test(quoted)) return activeFile || null;
  return path || activeFile || null;
};

const contextText = (results: ManagerToolResult[]): string =>
  formatContextResults(results).slice(0, 28000);

const normalizeModelChanges = (
  result: ModelResult,
  files: Record<string, string>,
): AgentChange[] => {
  if (result.kind !== 'changes') return [];
  return result.changes.map((change) => {
    const path = change.path || change.filePath || '';
    const content = typeof change.after === 'string' ? change.after : change.content;
    return {
      ...change,
      path,
      before: change.before ?? files[path],
      ...(content !== undefined ? { after: content } : {}),
    };
  });
};

async function loadModel(): Promise<ManagerModelClient> {
  const { askWebLLM } = await import('../WebLLMAPI');
  return async ({
    model,
    messages,
    signal,
    onMetrics,
    temperature,
    top_p,
    max_tokens,
  }: ManagerModelCall) =>
    askWebLLM('', '', null, {
      model,
      messages,
      signal,
      requestKind: 'agent',
      onMetrics,
      temperature,
      top_p,
      max_tokens,
    });
}

type ManagerExecutionResult = Omit<RunManagerResult, 'trace'>;

type ManagerExecutionOptions = RunManagerOptions & {
  recorder: ManagerTraceRecorder;
  onWorkspace: (workspace: import('./Workspace').AgentWorkspace) => void;
};

async function executeManager({
  request,
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
  if (priorContext)
    toolResults.push({ tool: 'read_file', value: priorContext, text: `[prior]\n${priorContext}` });
  const path = extractPath(request, scope === 'file' ? activeFile : null);
  if (path && Object.hasOwn(workspace.files, path)) await notifyTool('read_file', { path });
  else {
    await notifyTool('list_files', { query: '' });
    const query = extractQuery(request);
    if (query) await notifyTool('search_workspace', { query });
  }
  if (scope === 'file' && activeFile && selectedLines.length) {
    await notifyTool('read_file', { path: activeFile });
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
      max_tokens: task === 'answer' ? 1200 : 2600,
    });
    messages.push({ role: 'assistant', content: reply });
    onEvent({ type: 'model', turn: round + 1, task, output: reply });
    try {
      result = parseModelResult(reply);
    } catch (error) {
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
        if (status === 'failed' && repair < MAX_REPAIR_ATTEMPTS) {
          diagnostics = verification.text;
          task = 'repair-changes';
          toolResults.push(verification);
          const prompt = buildManagerModelPrompt(
            request,
            contextText(toolResults),
            task,
            diagnostics,
          );
          messages.push({ role: 'user', content: prompt });
          const reply = await askModel({
            model,
            messages,
            signal,
            task,
            onMetrics,
            temperature: 0.1,
            top_p: 0.8,
            max_tokens: 2600,
          });
          messages.push({ role: 'assistant', content: reply });
          result = parseModelResult(reply);
          if (result.kind !== 'changes')
            throw new Error('The repair response did not return changes.');
          changes = normalizeModelChanges(result, workspace.files);
          continue;
        }
        if (status === 'failed') throw new Error(verification.text);
      }
      let previewSummary = '';
      if (planIncludesTool(plan, 'inspect_preview')) {
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
    if (repair >= MAX_REPAIR_ATTEMPTS) throw new Error(validation.rejected.join(' '));
    diagnostics = validation.rejected.join('\n');
    task = 'repair-changes';
    const prompt = buildManagerModelPrompt(request, contextText(toolResults), task, diagnostics);
    messages.push({ role: 'user', content: prompt });
    const reply = await askModel({
      model,
      messages,
      signal,
      task,
      onMetrics,
      temperature: 0.1,
      top_p: 0.8,
      max_tokens: 2600,
    });
    messages.push({ role: 'assistant', content: reply });
    result = parseModelResult(reply);
    if (result.kind !== 'changes') throw new Error('The repair response did not return changes.');
    changes = normalizeModelChanges(result, workspace.files);
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

  try {
    const result = await executeManager({
      ...options,
      onEvent,
      recorder,
      onWorkspace: (nextWorkspace) => {
        workspaceHolder.current = nextWorkspace;
      },
    });
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
