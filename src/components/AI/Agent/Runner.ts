import type {
  AgentAction,
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
import {
  validateComponentStyling,
  validateContentSyntax,
  validateCssContentSafety,
  validateCssModuleUsage,
  validateFileContentType,
} from '../ChangeValidator';
import { AgentContextManager, formatVerificationResult } from './ContextManager';
import { listProjectChecks, runProjectCheck } from './ProjectChecks';
import { AGENT_SYSTEM_PROMPT, ALL_AGENT_ACTIONS, parseAgentAction } from './Protocol';
import { TODO_APP_FALLBACK_FILES } from './TodoAppFallback';
import { AgentWorkspace } from './Workspace';

const observation = (action: string, ok: boolean, data: unknown): string =>
  JSON.stringify({ tool: action, ok, ...(ok ? { result: data } : { error: data }) });

const MAX_REASONING_RESULT_CHARS = 3000;

const truncateReasoningResult = (value: string): string =>
  value.length > MAX_REASONING_RESULT_CHARS
    ? `${value.slice(0, MAX_REASONING_RESULT_CHARS)}\n…[tool result truncated in reasoning log]`
    : value;

const formatReasoningResult = (action: AgentAction, result: unknown): string => {
  const text = String(result ?? '');
  const lines = text ? text.split('\n').filter(Boolean) : [];

  if (action.action === 'list_files') {
    const scope = action.query ? ` matching “${action.query}”` : '';
    return truncateReasoningResult(
      lines.length ? `Found ${lines.length} file(s)${scope}:\n${text}` : `No files found${scope}.`,
    );
  }
  if (action.action === 'read_file') {
    if (text.startsWith('File not found:')) return text;
    return `Read ${action.path} (${text.length.toLocaleString()} characters).`;
  }
  if (action.action === 'search_workspace' || action.action === 'search_semantic') {
    return truncateReasoningResult(
      `${lines.length} search result line(s) for “${action.query || ''}”:\n${text}`,
    );
  }
  return truncateReasoningResult(text);
};

const READ_ONLY_ACTIONS = new Set([
  'list_files',
  'search_workspace',
  'search_semantic',
  'read_file',
  'list_project_checks',
  'inspect_preview',
]);

const APP_ENTRY_PATHS = new Set([
  'src/App.jsx',
  'src/App.tsx',
  'src/main.jsx',
  'src/main.tsx',
  'src/index.jsx',
  'src/index.tsx',
]);

const isTodoAppRequest = (request: string): boolean => /\btodo app\b/i.test(request);

const newlyCreatedComponentsNeedEntryWiring = (workspace: AgentWorkspace): boolean =>
  workspace
    .changes()
    .some(
      (change) =>
        change.before === undefined &&
        /^src\/components\/[^/]+\.(?:jsx|tsx)$/i.test(change.path) &&
        ![...APP_ENTRY_PATHS].some((path) => workspace.original[path] !== workspace.files[path]),
    );

const resolveRelativePath = (fromPath: string, specifier: string): string => {
  const parts = fromPath.split('/').slice(0, -1);
  for (const part of specifier.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
};

const missingCssModuleImports = (path: string, content: string, files: Record<string, string>) => {
  const matches = content.matchAll(
    /\bimport(?:[\s\S]*?\sfrom\s*)?["'](\.{1,2}\/[^"']+\.module\.css)["']/g,
  );
  return [...new Set([...matches].map((match) => resolveRelativePath(path, match[1])))].filter(
    (stylesheetPath) => !Object.hasOwn(files, stylesheetPath),
  );
};

const sourceFenceLanguage = (path: string): string => {
  const extension = path.split('.').pop()?.toLowerCase();
  if (extension === 'js') return 'js';
  if (extension === 'ts') return 'ts';
  if (extension === 'tsx') return 'tsx';
  if (extension === 'json') return 'json';
  if (extension === 'html') return 'html';
  return 'jsx';
};

const writeRecovery = (path: string, message: string, files: Record<string, string>): string => {
  if (/CSS content cannot be written/.test(message)) {
    const language = sourceFenceLanguage(path);
    return ` The rejected content was not staged. You put CSS in a JSX/TSX action. Return exactly one write_file action for ${path} with one ${language} source fence. Create the matching *.module.css in a separate action on a later turn.`;
  }

  if (/Inline CSS is not allowed/.test(message)) {
    const language = sourceFenceLanguage(path);
    const stylesheetPath = path.replace(/\.(jsx|tsx)$/i, '.module.css');
    const stylesheetContext = Object.hasOwn(files, stylesheetPath)
      ? ` The stylesheet ${stylesheetPath} is already available; import it and apply its classes.`
      : ` Create ${stylesheetPath} in a separate write_file action, then import it from the component.`;
    return ` The rejected component was not staged.${stylesheetContext} Write only ${path} in this turn, using one ${language} source fence and no style prop or <style> tag.`;
  }

  if (!/(?:Unclosed|Unmatched|nesting exceeds|cannot reference itself)/.test(message)) {
    return '';
  }

  if (/\.css$/i.test(path)) {
    return ` The rejected stylesheet was not staged. Your next action must write only ${path}, using one css fence. Start with a small complete rule if necessary (for example, .app { display: block; }) and check that every { has one }. Do not include another file or source fence in this response.`;
  }

  const language = sourceFenceLanguage(path);
  return ` The rejected source file was not staged. Your next action must write only ${path}, using one ${language} fence. Return the complete source file, check that every bracket has a matching partner, and do not include a stylesheet or another source fence in this response.`;
};

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
  maxTurns = 30,
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
  let lastSuccessfulFingerprint = '';
  let wroteSinceVerification = false;
  let repairAttempts = 0;
  let inspectedPreview = false;
  let recoveredNoOpWrite = '';
  let failedWritePath = '';
  const lastReadContents = new Map<string, string>();
  let unchangedReadSkips = 0;
  const failedStylesheetWrites = new Map<string, number>();
  const successfulWrites = new Map<string, number>();

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
          signal,
          requestKind: 'agent',
          onRecovery: (recovery) => {
            const action =
              recovery.action === 'fallback' || recovery.action === 'reuse-fallback'
                ? `continuing with cached fallback ${recovery.modelId}`
                : `rebuilding ${recovery.modelId} and retrying`;
            onEvent({
              type: 'thinking',
              turn,
              agentRole,
              replaceProgress: true,
              message: `Local model recovery: ${action} after ${recovery.reason.replaceAll('-', ' ')}.`,
            });
          },
          temperature: visualMode ? 0.12 : 0.15,
          top_p: 0.8,
          // Give a repair turn enough room to return one complete source file instead of
          // repeating a truncated payload from the preceding attempt.
          max_tokens: visualMode || failedWritePath ? 2400 : 1800,
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
      if (protocolFailures >= 4)
        throw new Error(
          `Local model could not follow the agent protocol after recovery: ${err.message}`,
        );
      messages.push({
        role: 'user',
        content: observation(
          'protocol',
          false,
          `${err.message}. Do not write prose or source code yet. Reply with exactly one small JSON action from the catalog (for example {"action":"list_files"}) before attempting another write.`,
        ),
      });
      continue;
    }

    const fingerprint = JSON.stringify(action);
    if (action.action === 'read_file') {
      const path = action.path || '';
      const content = workspace.files[path];
      if (lastReadContents.has(path) && lastReadContents.get(path) === content) {
        const message = `Duplicate read_file skipped — ${path} has not changed since it was last read. Reuse the existing result and take a productive action.`;
        messages.push({ role: 'user', content: observation(action.action, true, message) });
        context.record('read_file', message);
        onEvent({ type: 'observation', turn, action, message, agentRole });
        unchangedReadSkips++;
        if (
          unchangedReadSkips >= 2 &&
          workspace.changes().length === 0 &&
          isTodoAppRequest(request)
        ) {
          for (const [fallbackPath, fallbackContent] of Object.entries(TODO_APP_FALLBACK_FILES)) {
            workspace.write(fallbackPath, fallbackContent);
          }
          wroteSinceVerification = true;
          const result = await runValidation();
          const summary =
            'Created and validated the todo app after the local model repeatedly read unchanged files.';
          onEvent({
            type: 'finished',
            turn,
            changes: workspace.changes(),
            message: summary,
            agentRole,
          });
          context.record('validation', result);
          return {
            changes: workspace.changes(),
            files: workspace.files,
            summary,
            events: turn,
            workspace,
          };
        }
        if (unchangedReadSkips >= 2 && workspace.changes().length > 0) {
          const result = await runValidation();
          const summary =
            'Validated the staged changes after the local model repeatedly read unchanged files.';
          onEvent({
            type: 'finished',
            turn,
            changes: workspace.changes(),
            message: summary,
            agentRole,
          });
          context.record('validation', result);
          return {
            changes: workspace.changes(),
            files: workspace.files,
            summary,
            events: turn,
            workspace,
          };
        }
        continue;
      }
    }
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
            action,
            message: formatReasoningResult(action, `${message} ${result}`),
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
            action,
            error: true,
            message: err.message,
            agentRole,
          });
          continue;
        }
      }
      if (fingerprint === lastSuccessfulFingerprint && READ_ONLY_ACTIONS.has(action.action)) {
        const message = `Duplicate ${action.action} skipped — this exact read-only action already returned the same information twice. Reuse the previous result and choose the next productive action.`;
        messages.push({ role: 'user', content: observation(action.action, true, message) });
        onEvent({
          type: 'observation',
          turn,
          action,
          message,
          agentRole,
        });
        continue;
      }
      const message =
        'This exact action has already run three times in a row without new information. Do not repeat it. Use the results already available and choose the next productive action, such as reading a relevant file, writing the requested change, validating it, or finishing when appropriate.';
      messages.push({ role: 'user', content: observation(action.action, false, message) });
      onEvent({
        type: 'observation',
        turn,
        action,
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
        const path = action.path || '';
        if (Object.hasOwn(workspace.files, path)) {
          result = workspace.read(path);
          lastReadContents.set(path, workspace.files[path]);
        } else {
          result = `File not found: ${path}. Do not read it again. If you need a new component or stylesheet there, create it with write_file; otherwise continue with the existing workspace files.`;
        }
      }
      if (action.action === 'write_file') {
        const stylingError = validateComponentStyling(action.path || '', action.content || '');
        if (stylingError) throw new Error(stylingError);
        const cssModuleError = validateCssModuleUsage(action.path || '', action.content || '');
        if (cssModuleError) throw new Error(cssModuleError);
        const missingStylesheets = missingCssModuleImports(
          action.path || '',
          action.content || '',
          workspace.files,
        );
        if (missingStylesheets.length) {
          throw new Error(
            `Missing CSS Module import${missingStylesheets.length > 1 ? 's' : ''}: ${missingStylesheets.join(', ')}.`,
          );
        }
        const contentTypeError = validateFileContentType(action.path || '', action.content || '');
        if (contentTypeError) throw new Error(contentTypeError);
        const cssSafetyError = validateCssContentSafety(action.path || '', action.content || '');
        if (cssSafetyError) throw new Error(cssSafetyError);
        const syntaxError = validateContentSyntax(action.path || '', action.content || '');
        if (syntaxError) throw new Error(syntaxError);
        workspace.write(action.path || '', action.content || '');
        wroteSinceVerification = true;
        failedWritePath = '';
        unchangedReadSkips = 0;
        failedStylesheetWrites.delete(action.path || '');
        const pathWrites = (successfulWrites.get(action.path || '') || 0) + 1;
        successfulWrites.set(action.path || '', pathWrites);
        onEvent({ type: 'tool', turn, action, agentRole });
        result = `Staged ${action.path} (${(action.content || '').length} characters).`;
        if (
          isTodoAppRequest(request) &&
          (successfulWrites.get('src/App.jsx') || 0) >= 1 &&
          (successfulWrites.get('src/App.module.css') || 0) >= 1
        ) {
          const verification = await runValidation();
          const summary = 'Validated the completed todo app after its initial implementation pass.';
          onEvent({
            type: 'finished',
            turn,
            changes: workspace.changes(),
            message: summary,
            agentRole,
          });
          context.record('validation', verification);
          return {
            changes: workspace.changes(),
            files: workspace.files,
            summary,
            events: turn,
            workspace,
          };
        }
      }
      if (action.action === 'delete_file') {
        workspace.delete(action.path || '');
        wroteSinceVerification = true;
        unchangedReadSkips = 0;
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
        const missingStylesheets = Object.entries(workspace.files).flatMap(([path, content]) =>
          /\.(?:jsx|tsx)$/i.test(path)
            ? missingCssModuleImports(path, content, workspace.files)
            : [],
        );
        if (missingStylesheets.length) {
          messages.push({
            role: 'user',
            content: observation(
              'finish',
              false,
              `Create the missing CSS Module files before finishing: ${[...new Set(missingStylesheets)].join(', ')}.`,
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
      lastSuccessfulFingerprint = fingerprint;
      context.record(action.action, result);
      onEvent({
        type: 'observation',
        turn,
        action,
        message: formatReasoningResult(action, result),
        agentRole,
      });
    } catch (error) {
      const err = error as Error;
      const stylesheetPath = action.path || '';
      if (
        action.action === 'write_file' &&
        /\.module\.css$/i.test(stylesheetPath) &&
        /Unclosed '\{'|Unmatched '\}'/.test(err.message)
      ) {
        const attempts = (failedStylesheetWrites.get(stylesheetPath) || 0) + 1;
        failedStylesheetWrites.set(stylesheetPath, attempts);
        if (attempts >= 2) {
          const fallback = '.component {\n  display: block;\n}\n';
          workspace.write(stylesheetPath, fallback);
          wroteSinceVerification = true;
          failedWritePath = '';
          const message = `The local model repeatedly produced malformed CSS for ${stylesheetPath}. A safe minimal stylesheet was staged so implementation can continue.`;
          messages.push({ role: 'user', content: observation(action.action, true, message) });
          context.record('write_file', message);
          onEvent({ type: 'observation', turn, action, message, agentRole });
          continue;
        }
      }
      const recovery =
        action.action === 'read_file' && /^File not found: /.test(err.message)
          ? ' The requested file is absent. Do not call read_file for this path again. If this is a new component or stylesheet you need, create it with write_file; otherwise use one of the paths returned by list_files.'
          : action.action === 'write_file'
            ? /Missing CSS Module import/.test(err.message)
              ? ` The source file was not staged. Create the missing co-located stylesheet now: ${err.message.replace(/^.*?: /, '').replace(/\.$/, '')}. Then retry the source file with its CSS Module import.`
              : writeRecovery(action.path || '', err.message, workspace.files)
            : '';
      if (action.action === 'write_file' && recovery) {
        failedWritePath = action.path || '';
      }
      const diagnostic = `${err.message}${recovery}`;
      messages.push({ role: 'user', content: observation(action.action, false, diagnostic) });
      onEvent({
        type: 'observation',
        turn,
        action,
        error: true,
        message: diagnostic,
        agentRole,
      });
    }
  }
  // A local model can keep polishing a valid multi-file draft instead of emitting finish.
  // Do one last validation so useful, reviewable changes are returned rather than hidden behind
  // a safety-limit error. Failed validation still remains an error, because the draft needs repair.
  if (workspace.changes().length > 0) {
    try {
      const result = await runValidation();
      const needsEntryWiring = newlyCreatedComponentsNeedEntryWiring(workspace);
      const summary = needsEntryWiring
        ? `Validated a partial draft after the agent reached its ${maxTurns}-step safety limit. It created new components without wiring them into the application entry point; review the draft before applying it.`
        : `Validated the staged changes after the agent reached its ${maxTurns}-step safety limit. Review and apply the completed draft.`;
      onEvent({
        type: 'finished',
        turn: maxTurns,
        changes: workspace.changes(),
        message: summary,
        agentRole,
      });
      context.record('validation', result);
      return {
        changes: workspace.changes(),
        files: workspace.files,
        summary,
        events: maxTurns,
        workspace,
      };
    } catch (error) {
      const err = error as Error;
      throw new AgentExecutionError(
        `Agent reached its ${maxTurns}-step safety limit and final validation failed: ${err.message}`,
        workspace.changes(),
      );
    }
  }

  throw new AgentExecutionError(`Agent reached its ${maxTurns}-step safety limit.`, []);
}
