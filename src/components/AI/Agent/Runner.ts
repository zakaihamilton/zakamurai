import type {
  AgentChange,
  RunAgentOptions,
  RunAgentResult,
  VerificationResult,
  WebLLMMessage,
} from '@/components/AI/types';

export class AgentExecutionError extends Error {
  changes: AgentChange[];
  constructor(message: string, changes: AgentChange[]) {
    super(message);
    this.name = 'AgentExecutionError';
    this.changes = changes;
  }
}
import { validateComponentStyling, validateFileContentType } from '../ChangeValidator';
import { AgentContextManager, formatVerificationResult } from './ContextManager';
import { listProjectChecks, runProjectCheck } from './ProjectChecks';
import { AGENT_SYSTEM_PROMPT, ALL_AGENT_ACTIONS, parseAgentAction } from './Protocol';
import { AgentWorkspace } from './Workspace';

const observation = (action: string, ok: boolean, data: unknown): string =>
  JSON.stringify({ tool: action, ok, ...(ok ? { result: data } : { error: data }) });

const loadAskWebLLM = async () => {
  const { askWebLLM } = await import('../WebLLMAPI');
  return askWebLLM;
};

type BuildUserRequestOptions = {
  request: string;
  scope?: string;
  activeFile?: string | null;
  selectedLines?: number[];
  priorContext?: string;
};

const buildUserRequest = ({
  request,
  scope,
  activeFile,
  selectedLines = [],
  priorContext,
}: BuildUserRequestOptions): string => {
  const scopeBlock =
    scope === 'project'
      ? `Request: ${request}\nScope: whole project\nStart by inspecting the entire workspace. Do not assume any file is the primary target.`
      : `Request: ${request}\nScope: current file\nActive file: ${activeFile || 'none'}\nSelected lines: ${selectedLines.join(', ') || 'none'}\nStart by inspecting the workspace.`;
  if (!priorContext) return scopeBlock;
  return `${scopeBlock}\n\nPrior conversation context:\n${priorContext}`;
};

export async function runAgent({
  request,
  scope = 'file',
  activeFile,
  selectedLines = [],
  files,
  model,
  validate,
  runProjectCheck: executeProjectCheck,
  inspectPreview,
  retrieveContext,
  signal,
  onEvent = () => {},
  maxTurns = 20,
  systemPrompt = AGENT_SYSTEM_PROMPT,
  allowedActions = ALL_AGENT_ACTIONS,
  priorContext = '',
  workspace: existingWorkspace = null,
  agentRole = null,
  workspaceIndex = null,
  visualMode = false,
  requirePreviewInspection = false,
}: RunAgentOptions): Promise<RunAgentResult> {
  const askWebLLM = await loadAskWebLLM();
  const workspace = existingWorkspace || new AgentWorkspace(files, workspaceIndex);
  const context = new AgentContextManager({ request, priorContext });
  const messages: WebLLMMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: buildUserRequest({
        request,
        scope,
        activeFile,
        selectedLines,
        priorContext: context.toString(),
      }),
    },
  ];
  let protocolFailures = 0;
  let lastFingerprint = '';
  let repeatedActions = 0;
  let wroteSinceVerification = false;
  let repairAttempts = 0;
  let inspectedPreview = false;
  let recoveredNoOpWrite = '';

  const runValidation = async (): Promise<string> => {
    const rawVerification = validate
      ? await validate(workspace.files)
      : { status: 'unavailable', check: 'build', diagnostics: 'Validation is unavailable.' };
    const verification: VerificationResult =
      typeof rawVerification === 'string'
        ? {
            status: /\b(passed|success|ok)\b/i.test(rawVerification) ? 'passed' : 'failed',
            check: 'build',
            diagnostics: rawVerification,
          }
        : rawVerification;
    const result = formatVerificationResult(verification);
    context.record('verification', verification);
    if (verification.status === 'passed' || verification.status === 'unavailable') {
      wroteSinceVerification = false;
      repairAttempts = 0;
    } else if (++repairAttempts >= 3) {
      throw new AgentExecutionError(
        'Validation failed after 3 repair attempts. Staged changes were preserved for review.',
        workspace.changes(),
      );
    }
    return result;
  };

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (signal?.aborted) throw new DOMException('Agent stopped', 'AbortError');
    onEvent({
      type: 'thinking',
      turn,
      agentRole,
      message:
        turn === 1
          ? 'Reviewing the request and available workspace context before choosing an action…'
          : 'Reviewing the latest tool result and choosing the next action…',
    });
    onEvent({
      type: 'thinking',
      turn,
      agentRole,
      message: `Requesting the next action from the local model (turn ${turn} of ${maxTurns}; ${Object.keys(workspace.files).length} workspace file(s) available)…`,
    });
    let receivedModelOutput = false;
    let streamedCharacterCount = 0;
    const responseStartedAt = Date.now();
    const heartbeat = setInterval(() => {
      const elapsedSeconds = Math.max(1, Math.floor((Date.now() - responseStartedAt) / 1000));
      const progress = receivedModelOutput
        ? `${streamedCharacterCount.toLocaleString()} character(s) received; waiting for a complete JSON action before validation`
        : 'the model has not started streaming yet; keeping the workspace context ready';
      onEvent({
        type: 'thinking',
        turn,
        agentRole,
        replaceProgress: true,
        message: `Local model is still working (${elapsedSeconds}s elapsed; ${progress})…`,
      });
    }, 3_000);
    let reply: string;
    try {
      reply = await askWebLLM(
        '',
        '',
        (output) => {
          streamedCharacterCount = output.length;
          if (receivedModelOutput) return;
          receivedModelOutput = true;
          onEvent({
            type: 'thinking',
            turn,
            agentRole,
            replaceProgress: true,
            message: `Local model is responding — streaming its next action (${streamedCharacterCount.toLocaleString()} character(s) received). Waiting for one complete JSON action before validation…`,
          });
        },
        {
          model,
          messages,
          temperature: visualMode ? 0.12 : 0.15,
          top_p: 0.8,
          max_tokens: visualMode ? 2400 : 1800,
        },
      );
    } finally {
      clearInterval(heartbeat);
    }
    messages.push({ role: 'assistant', content: reply });

    let action: ReturnType<typeof parseAgentAction> | undefined;
    try {
      action = parseAgentAction(reply, { allowedActions });
      protocolFailures = 0;
    } catch (error) {
      const err = error as Error;
      protocolFailures++;
      if (protocolFailures >= 2)
        throw new Error(
          `Local model could not follow the agent protocol after recovery: ${err.message}`,
        );
      messages.push({
        role: 'user',
        content: observation(
          'protocol',
          false,
          `${err.message}. Return exactly one valid JSON action. Last valid context: ${context.toString().slice(-1200)}`,
        ),
      });
      continue;
    }

    const fingerprint = JSON.stringify(action);
    if (fingerprint === recoveredNoOpWrite) {
      const summary =
        'Validated the staged changes after the local model repeated an identical write action.';
      const changes = workspace.changes();
      onEvent({ type: 'finished', turn, changes, message: summary, agentRole });
      return { changes, files: workspace.files, summary, events: turn, workspace };
    }
    if (recoveredNoOpWrite) recoveredNoOpWrite = '';
    repeatedActions = fingerprint === lastFingerprint ? repeatedActions + 1 : 0;
    lastFingerprint = fingerprint;
    const writePath = action.action === 'write_file' ? action.path || '' : '';
    const isRepeatedSavedWrite =
      action.action === 'write_file' &&
      Object.hasOwn(workspace.files, writePath) &&
      workspace.files[writePath] === (action.content || '');
    if (repeatedActions === 2) {
      if (isRepeatedSavedWrite) {
        const message = `The proposed write to ${action.path} is already staged with identical content. Automatically validating the workspace instead of rewriting it.`;
        try {
          const result = await runValidation();
          messages.push({
            role: 'user',
            content: observation(action.action, true, `${message}\n${result}`),
          });
          context.record('write_file', message);
          onEvent({
            type: 'observation',
            turn,
            action: action.action,
            message: `${message} ${result}`.slice(0, 500),
            agentRole,
          });
          recoveredNoOpWrite = fingerprint;
          lastFingerprint = '';
          repeatedActions = 0;
          continue;
        } catch (error) {
          const err = error as Error;
          messages.push({ role: 'user', content: observation(action.action, false, err.message) });
          onEvent({
            type: 'observation',
            turn,
            action: action.action,
            error: true,
            message: err.message,
            agentRole,
          });
          continue;
        }
      }
      const message =
        'This exact action has already run three times in a row without new information. Do not repeat it. Use the results already available and choose the next productive action, such as reading a relevant file, writing the requested change, validating it, or finishing when appropriate.';
      messages.push({ role: 'user', content: observation(action.action, false, message) });
      onEvent({
        type: 'observation',
        turn,
        action: action.action,
        error: true,
        message,
        agentRole,
      });
      continue;
    }
    if (repeatedActions >= 3)
      throw new AgentExecutionError(
        'Agent stopped after repeating the same action despite recovery guidance. Staged changes were preserved for review.',
        workspace.changes(),
      );
    try {
      let result: string | undefined;
      if (action.action === 'list_files') {
        onEvent({ type: 'tool', turn, action, agentRole });
        result = workspace.list(action.query).join('\n');
      }
      if (action.action === 'search_workspace') {
        onEvent({ type: 'tool', turn, action, agentRole });
        result = String(await workspace.search(action.query || '', action.glob));
      }
      if (action.action === 'search_semantic') {
        onEvent({ type: 'tool', turn, action, agentRole });
        if (!retrieveContext) throw new Error('Semantic search is unavailable in this session.');
        result = await workspace.semanticSearch(action.query || '', retrieveContext, action.k);
      }
      if (action.action === 'read_file') {
        onEvent({ type: 'tool', turn, action, agentRole });
        result = workspace.read(action.path || '');
      }
      if (action.action === 'write_file') {
        const stylingError = validateComponentStyling(action.path || '', action.content || '');
        if (stylingError) throw new Error(stylingError);
        const contentTypeError = validateFileContentType(action.path || '', action.content || '');
        if (contentTypeError) throw new Error(contentTypeError);
        workspace.write(action.path || '', action.content || '');
        wroteSinceVerification = true;
        onEvent({ type: 'tool', turn, action, agentRole });
        result = `Staged ${action.path} (${(action.content || '').length} characters).`;
      }
      if (action.action === 'delete_file') {
        workspace.delete(action.path || '');
        wroteSinceVerification = true;
        onEvent({ type: 'tool', turn, action, agentRole });
        result = `Staged deletion of ${action.path}.`;
      }
      if (action.action === 'validate') {
        onEvent({ type: 'tool', turn, action, agentRole });
        result = await runValidation();
      }
      if (action.action === 'list_project_checks') {
        onEvent({ type: 'tool', turn, action, agentRole });
        result = listProjectChecks(workspace.files).join('\n') || 'No eligible project checks.';
      }
      if (action.action === 'run_project_check') {
        onEvent({ type: 'tool', turn, action, agentRole });
        const checkResult = await runProjectCheck({
          check: action.check || '',
          files: workspace.files,
          run: executeProjectCheck,
        });
        result = formatVerificationResult(checkResult);
        context.record('project-check', checkResult);
      }
      if (action.action === 'inspect_preview') {
        onEvent({ type: 'tool', turn, action, agentRole });
        const preview = inspectPreview
          ? await inspectPreview(workspace.files)
          : { status: 'unavailable', diagnostics: 'Preview inspection is unavailable.' };
        result = JSON.stringify(preview);
        inspectedPreview = true;
        context.record('preview', preview);
      }
      if (action.action === 'finish') {
        onEvent({ type: 'tool', turn, action, agentRole });
        if (requirePreviewInspection && !inspectedPreview) {
          messages.push({
            role: 'user',
            content: observation(
              'finish',
              false,
              'Visual UI review requires action "inspect_preview" before finishing. Use its structured evidence to assess landmarks, named controls, runtime errors, and the visual brief.',
            ),
          });
          continue;
        }
        if (wroteSinceVerification && validate) {
          messages.push({
            role: 'user',
            content: observation(
              'finish',
              false,
              'Validate the staged edits by running action "validate" before finishing.',
            ),
          });
          continue;
        }
        const changes = workspace.changes();
        onEvent({ type: 'finished', turn, changes, message: action.summary, agentRole });
        return {
          changes,
          files: workspace.files,
          summary: action.summary || '',
          events: turn,
          workspace,
        };
      }
      messages.push({ role: 'user', content: observation(action.action, true, result) });
      context.record(action.action, result);
      onEvent({
        type: 'observation',
        turn,
        action: action.action,
        message: String(result).slice(0, 500),
        agentRole,
      });
    } catch (error) {
      const err = error as Error;
      const recovery =
        action.action === 'read_file' && /^File not found: /.test(err.message)
          ? ' The requested file is absent. Do not call read_file for this path again. If this is a new component or stylesheet you need, create it with write_file; otherwise use one of the paths returned by list_files.'
          : '';
      const diagnostic = `${err.message}${recovery}`;
      messages.push({ role: 'user', content: observation(action.action, false, diagnostic) });
      onEvent({
        type: 'observation',
        turn,
        action: action.action,
        error: true,
        message: diagnostic,
        agentRole,
      });
    }
  }
  throw new AgentExecutionError(
    `Agent reached its ${maxTurns}-step safety limit.`,
    workspace.changes(),
  );
}
