import type { RunAgentOptions, RunAgentResult, VerificationResult, WebLLMMessage } from '@/components/AI/types';
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

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (signal?.aborted) throw new DOMException('Agent stopped', 'AbortError');
    onEvent({
      type: 'thinking',
      turn,
      agentRole,
      message: `Planning step ${turn}`,
    });
    const reply = await askWebLLM('', '', null, {
      model,
      messages,
      temperature: 0.15,
      top_p: 0.8,
      max_tokens: 1800,
    });
    messages.push({ role: 'assistant', content: reply });

    let action;
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
    repeatedActions = fingerprint === lastFingerprint ? repeatedActions + 1 : 0;
    lastFingerprint = fingerprint;
    if (repeatedActions >= 2)
      throw new Error(
        'Agent stopped after repeating the same action without progress. Inspect the latest diagnostic or choose another tool.',
      );
    onEvent({ type: 'tool', turn, action, agentRole });

    try {
      let result: string | undefined;
      if (action.action === 'list_files') result = workspace.list(action.query).join('\n');
      if (action.action === 'search_workspace')
        result = String(await workspace.search(action.query || '', action.glob));
      if (action.action === 'search_semantic') {
        if (!retrieveContext) throw new Error('Semantic search is unavailable in this session.');
        result = await workspace.semanticSearch(action.query || '', retrieveContext, action.k);
      }
      if (action.action === 'read_file') result = workspace.read(action.path || '');
      if (action.action === 'write_file') {
        workspace.write(action.path || '', action.content || '');
        wroteSinceVerification = true;
        result = `Staged ${action.path} (${(action.content || '').length} characters).`;
      }
      if (action.action === 'delete_file') {
        workspace.delete(action.path || '');
        wroteSinceVerification = true;
        result = `Staged deletion of ${action.path}.`;
      }
      if (action.action === 'validate') {
        let verification: VerificationResult = validate
          ? await validate(workspace.files)
          : { status: 'unavailable', check: 'build', diagnostics: 'Validation is unavailable.' };
        if (typeof verification === 'string') {
          verification = {
            status: /\b(passed|success|ok)\b/i.test(verification) ? 'passed' : 'failed',
            check: 'build',
            diagnostics: verification,
          };
        }
        result = formatVerificationResult(verification);
        context.record('verification', verification);
        if (verification.status === 'passed' || verification.status === 'unavailable') {
          wroteSinceVerification = false;
          repairAttempts = 0;
        } else if (++repairAttempts >= 3) {
          throw new Error(
            'Validation failed after 3 repair attempts. Staged changes were preserved for review.',
          );
        }
      }
      if (action.action === 'list_project_checks')
        result = listProjectChecks(workspace.files).join('\n') || 'No eligible project checks.';
      if (action.action === 'run_project_check') {
        const checkResult = await runProjectCheck({
          check: action.check || '',
          files: workspace.files,
          run: executeProjectCheck,
        });
        result = formatVerificationResult(checkResult);
        context.record('project-check', checkResult);
      }
      if (action.action === 'inspect_preview') {
        const preview = inspectPreview
          ? await inspectPreview(workspace.files)
          : { status: 'unavailable', diagnostics: 'Preview inspection is unavailable.' };
        result = JSON.stringify(preview);
        context.record('preview', preview);
      }
      if (action.action === 'finish') {
        if (wroteSinceVerification && validate) {
          messages.push({
            role: 'user',
            content: observation('finish', false, 'Validate the staged edits before finishing.'),
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
      messages.push({ role: 'user', content: observation(action.action, false, err.message) });
      onEvent({
        type: 'observation',
        turn,
        action: action.action,
        error: true,
        message: err.message,
        agentRole,
      });
    }
  }
  throw new Error(`Agent reached its ${maxTurns}-step safety limit.`);
}
