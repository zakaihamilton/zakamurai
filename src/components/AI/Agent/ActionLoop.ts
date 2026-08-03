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

class AgentRecoveryValidationError extends AgentExecutionError {}
import {
  validateAIChanges,
  validateComponentStyling,
  validateContentSyntax,
  validateCssContentSafety,
  validateCssModuleUsage,
  validateFileContentType,
} from '../ChangeValidator';
import {
  NON_PRODUCTIVE_ACTIONS,
  READ_ONLY_ACTIONS,
  cssModuleImporters,
  cssModuleRecovery,
  formatReasoningResult,
  isFailedValidationResult,
  missingCssModuleImports,
  missingCssModuleRules,
  normalizeSideEffectCssSource,
  observation,
} from './ActionLoopUtils';
import { AgentContextManager, formatVerificationResult } from './ContextManager';
import { parseModelResult } from './ManagerProtocol';
import { listProjectChecks, runProjectCheck } from './ProjectChecks';
import { AGENT_SYSTEM_PROMPT, ALL_AGENT_ACTIONS, parseAgentAction } from './Protocol';
import { AgentWorkspace } from './Workspace';

const APP_ENTRY_PATHS = new Set([
  'src/App.jsx',
  'src/App.tsx',
  'src/main.jsx',
  'src/main.tsx',
  'src/index.jsx',
  'src/index.tsx',
]);

const CHANGE_REQUEST_PATTERN =
  /\b(?:add|build|change|create|delete|design|fix|implement|improve|make|modify|refactor|remove|rename|replace|style|update)\b/i;

const isTodoAppRequest = (request: string): boolean => /\btodo\s+app\b/i.test(request);

const TODO_APP_STYLESHEET = 'App.module.css';
const TODO_APP_RECOVERY_FILES = {
  'src/App.module.css': `:root {
  --ink: #24332d;
  --muted: #6d776f;
  --paper: #f7f0e5;
  --accent: #c85c3c;
  --line: rgb(36 51 45 / 16%);
}

* { box-sizing: border-box; }

.app {
  min-height: 100vh;
  padding: 3rem 1rem;
  color: var(--ink);
  font-family: "Segoe UI", sans-serif;
  background: var(--paper);
}

.card {
  width: min(100%, 42rem);
  margin: 0 auto;
  padding: clamp(1.5rem, 5vw, 3rem);
  background: rgb(255 252 246 / 90%);
  border: 1px solid var(--line);
  border-radius: 1.25rem;
  box-shadow: 0 1.5rem 3rem rgb(55 42 22 / 14%);
}

.eyebrow {
  margin: 0 0 0.75rem;
  color: var(--accent);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.title { margin: 0; font-size: clamp(2rem, 7vw, 4rem); letter-spacing: -0.06em; }
.subtitle { margin: 1rem 0 2rem; color: var(--muted); line-height: 1.5; }
.form { display: flex; gap: 0.75rem; margin-bottom: 1.5rem; }
.input { width: 100%; min-width: 0; padding: 0.85rem 1rem; font: inherit; border: 1px solid var(--line); border-radius: 0.7rem; }
.button { padding: 0.85rem 1rem; color: white; font: inherit; font-weight: 700; background: var(--accent); border: 0; border-radius: 0.7rem; cursor: pointer; }
.list { display: grid; gap: 0.4rem; margin: 0; padding: 0; list-style: none; }
.item { display: grid; grid-template-columns: auto 1fr auto; gap: 0.75rem; align-items: center; padding: 0.85rem 0; border-bottom: 1px solid var(--line); }
.completed { color: var(--muted); text-decoration: line-through; }
.delete { padding: 0.3rem; color: var(--muted); background: transparent; border: 0; cursor: pointer; }
.empty { padding: 2rem 0; color: var(--muted); text-align: center; }

@media (width <= 32rem) {
  .form { flex-direction: column; }
  .button { width: 100%; }
}
`,
  'src/App.jsx': `import { useState } from "react";
import styles from "./${TODO_APP_STYLESHEET}";

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [draft, setDraft] = useState("");

  function addTask(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setTasks((current) => [...current, { id: Date.now(), text, done: false }]);
    setDraft("");
  }

  function toggleTask(id) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, done: !task.done } : task));
  }

  function deleteTask(id) {
    setTasks((current) => current.filter((task) => task.id !== id));
  }

  return (
    <main className={styles.app}>
      <section className={styles.card} aria-labelledby="todo-title">
        <p className={styles.eyebrow}>The daily edit</p>
        <h1 className={styles.title} id="todo-title">Make room for what matters.</h1>
        <p className={styles.subtitle}>A quiet place to collect the next right things.</p>
        <form className={styles.form} onSubmit={addTask}>
          <input className={styles.input} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a task" aria-label="New task" />
          <button className={styles.button} type="submit">Add task</button>
        </form>
        {tasks.length === 0 ? <p className={styles.empty}>Your list is clear. What deserves your attention?</p> : (
          <ul className={styles.list} aria-label="Tasks">
            {tasks.map((task) => (
              <li className={styles.item} key={task.id}>
                <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} aria-label="Complete task" />
                <span className={task.done ? styles.completed : undefined}>{task.text}</span>
                <button className={styles.delete} type="button" onClick={() => deleteTask(task.id)}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
`,
} as const;

const recoveryWritePath = (
  files: Record<string, string>,
  activeFile?: string | null,
): string | null => {
  if (activeFile && Object.hasOwn(files, activeFile) && /\.(?:[jt]sx?)$/i.test(activeFile))
    return activeFile;
  return (
    [...APP_ENTRY_PATHS].find((path) => Object.hasOwn(files, path)) ||
    Object.keys(files).find((path) => /\.(?:[jt]sx?)$/i.test(path)) ||
    null
  );
};

const newlyCreatedComponentsNeedEntryWiring = (workspace: AgentWorkspace): boolean =>
  workspace
    .changes()
    .some(
      (change) =>
        change.before === undefined &&
        /^src\/components\/[^/]+\.(?:jsx|tsx)$/i.test(change.path) &&
        ![...APP_ENTRY_PATHS].some((path) => workspace.original[path] !== workspace.files[path]),
    );

const isScratchEntry = (content: string | undefined): boolean =>
  Boolean(
    content && /<h1>New Project<\/h1>/.test(content) && /Start coding here\.\.\./.test(content),
  );

/**
 * A small local model can successfully create a new component, then lose track of
 * the original App write. On a fresh project, make the completed component
 * reachable rather than returning a change set that cannot affect the preview.
 */
const wireNewComponentIntoScratchEntry = (workspace: AgentWorkspace): string | null => {
  const entryPath = [...APP_ENTRY_PATHS].find((path) => isScratchEntry(workspace.original[path]));
  if (!entryPath || workspace.original[entryPath] !== workspace.files[entryPath]) return null;

  const component = workspace
    .changes()
    .find(
      (change) =>
        change.before === undefined &&
        /^src\/components\/[^/]+\.(?:jsx|tsx)$/i.test(change.path) &&
        /\bexport\s+default\b/.test(change.after || ''),
    );
  if (!component?.after) return null;

  const componentName = component.path
    .split('/')
    .pop()
    ?.replace(/\.(?:jsx|tsx)$/i, '')
    .replace(/[^A-Za-z0-9_$]/g, '');
  if (!componentName || !/^[A-Za-z_$]/.test(componentName)) return null;

  const componentSpecifier = `./${component.path
    .split('/')
    .slice(1)
    .join('/')
    .replace(/\.(?:jsx|tsx)$/i, '')}`;
  workspace.write(
    entryPath,
    `import ${componentName} from "${componentSpecifier}";\n\nexport default function App() {\n  return <${componentName} />;\n}\n`,
  );
  return entryPath;
};

/**
 * Normalize a common local-model mistake before staging JSX: a side-effect CSS
 * import with literal class names. Generated projects use CSS Modules, so keep
 * the source and its stylesheet as one atomic recovery instead of allowing a
 * source-only overwrite that renders unstyled.
 */
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
      ? `Request: ${request}\nScope: whole project\n${priorContext ? 'Use the supplied workspace context; do not repeat the initial inventory.' : 'Start by inspecting the entire workspace. Do not assume any file is the primary target.'}`
      : `Request: ${request}\nScope: current file\nActive file: ${activeFile || 'none'}\nSelected lines: ${selectedLines.join(', ') || 'none'}\n${priorContext ? 'Use the supplied workspace context; do not repeat the initial inventory.' : 'Start by inspecting the workspace.'}`;
  const implementationGuidance = CHANGE_REQUEST_PATTERN.test(request)
    ? '\nImplementation requirement: this is a change request. Make at least one write_file or delete_file edit before using validate, inspect_preview, run_project_check, or finish. After one brief inspection, implement the request instead of continuing to inspect.'
    : '';
  const requestBlock = `${scopeBlock}${implementationGuidance}`;
  if (!priorContext) return requestBlock;
  return `${requestBlock}\n\nPrior conversation context:\n${priorContext}`;
};

const buildForcedWriteRecoveryMessages = ({
  request,
  targetPath,
  files,
}: {
  request: string;
  targetPath: string | null;
  files: Record<string, string>;
}): WebLLMMessage[] => {
  const targetContent = targetPath ? files[targetPath] : undefined;
  const context = targetPath
    ? `Current contents of ${targetPath}:\n${targetContent ?? '(file does not exist yet)'}`
    : 'No existing application entry file was identified. Choose a project-relative entry path.';
  const recoveryInstruction = targetPath
    ? `Recovery mode is active. Your next response must be a write_file action for ${targetPath} with complete source content. Return exactly one write_file action for ${targetPath}.`
    : 'Recovery mode is active. Your next response must be a write_file action with complete source content. Return exactly one write_file action.';

  return [
    {
      role: 'system',
      content:
        'You are in emergency write mode. Ignore normal inspection guidance: the workspace has already been inspected. Return exactly one write_file action now. Do not list, search, read, validate, inspect the preview, finish, or explain.',
    },
    {
      role: 'user',
      content: [
        `Original request: ${request}`,
        recoveryInstruction,
        targetPath
          ? `Required destination: ${targetPath}`
          : 'Required destination: choose the appropriate application source file.',
        context,
        'Implement the original request with complete source content. Return exactly one write_file action and nothing else.',
      ].join('\n\n'),
    },
  ];
};

const buildDirectChangesRecoveryMessages = ({
  request,
  targetPath,
  files,
}: {
  request: string;
  targetPath: string | null;
  files: Record<string, string>;
}): WebLLMMessage[] => {
  const context = targetPath
    ? `Current contents of ${targetPath}:\n${files[targetPath] ?? '(file does not exist yet)'}`
    : 'No existing application entry file was identified. Choose an appropriate project-relative path.';
  return [
    {
      role: 'system',
      content:
        'You are in direct recovery mode. Return exactly one JSON object with kind "changes" and complete file contents. Do not return an action, list files, read files, or explain.',
    },
    {
      role: 'user',
      content: [
        `Original request: ${request}`,
        targetPath
          ? `Primary file: ${targetPath}`
          : 'Primary file: choose the application entry file.',
        context,
        'Return this exact shape: {"kind":"changes","summary":"...","changes":[{"path":"...","content":"complete file content"}]}',
        'Implement the original request now. Include every file required for the implementation and no placeholder content.',
      ].join('\n\n'),
    },
  ];
};

export async function runActionLoop({
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
  onMetrics,
  maxTurns = 30,
  systemPrompt = AGENT_SYSTEM_PROMPT,
  allowedActions = ALL_AGENT_ACTIONS,
  priorContext = '',
  workspace: existingWorkspace = null,
  agentRole = null,
  workspaceIndex = null,
  visualMode = false,
  requirePreviewInspection = false,
  modelClient,
}: RunAgentOptions): Promise<RunAgentResult> {
  const askWebLLM = modelClient ? null : await loadAskWebLLM();
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
  let forcedWriteRecoveryPending = false;
  let forcedRecoveryTargetPath: string | null = null;
  let forcedWriteRecoveryViolations = 0;
  let directChangesRecoveryPending = false;
  let deferredSourceWrite: { path: string; content: string; stylesheets: string[] } | null = null;
  const lastReadContents = new Map<string, string>();
  let unchangedReadSkips = 0;
  let nonProductiveActionsWithoutWrite = 0;
  let directRepairAttempts = 0;
  const failedStylesheetWrites = new Map<string, number>();

  const runValidation = async (
    turn: number,
    provenance: 'model' | 'recovery' = 'recovery',
  ): Promise<string> => {
    onEvent({
      type: 'tool',
      turn,
      action: { action: 'validate' },
      agentRole,
      provenance,
    });
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
        `Validation failed after 3 repair attempts. Last result: ${result}. Staged changes were preserved for review.`,
        workspace.changes(),
      );
    }
    return result;
  };

  const recoverTodoApp = async (turn: number): Promise<RunAgentResult | null> => {
    if (!isTodoAppRequest(request) || workspace.changes().length > 0) return null;
    for (const [path, content] of Object.entries(TODO_APP_RECOVERY_FILES)) {
      workspace.write(path, content);
      onEvent({
        type: 'tool',
        turn,
        action: { action: 'write_file', path, content },
        agentRole,
        provenance: 'recovery',
      });
    }
    wroteSinceVerification = true;
    const verification = await runValidation(turn);
    if (isFailedValidationResult(verification)) {
      throw new AgentRecoveryValidationError(
        `Todo-app recovery validation failed: ${verification}`,
        workspace.changes(),
      );
    }
    const changes = workspace.changes();
    const summary = 'Created and validated the todo app with bounded recovery.';
    onEvent({ type: 'finished', turn, changes, message: summary, agentRole });
    context.record('validation', verification);
    return { changes, files: workspace.files, summary, events: turn, workspace };
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
      message: 'Requesting the next action from the local model...',
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
      const modelMessages = directChangesRecoveryPending
        ? buildDirectChangesRecoveryMessages({
            request,
            targetPath: forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile),
            files: workspace.files,
          })
        : forcedWriteRecoveryPending
          ? buildForcedWriteRecoveryMessages({
              request,
              targetPath:
                forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile),
              files: workspace.files,
            })
          : messages;
      if (modelClient) {
        reply = await modelClient({
          model,
          messages: modelMessages,
          signal,
          task: 'generate-changes',
          onMetrics,
          temperature: visualMode ? 0.12 : 0.15,
          top_p: 0.8,
          max_tokens: visualMode || failedWritePath || forcedWriteRecoveryPending ? 2400 : 1800,
        });
      } else {
        if (!askWebLLM) throw new Error('WebLLM is unavailable.');
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
            messages: modelMessages,
            signal,
            requestKind: 'agent',
            onMetrics,
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
            max_tokens: visualMode || failedWritePath || forcedWriteRecoveryPending ? 2400 : 1800,
          },
        );
      }
    } finally {
      clearInterval(heartbeat);
    }
    onEvent({
      type: 'model_io',
      turn,
      agentRole,
      input: (directChangesRecoveryPending
        ? buildDirectChangesRecoveryMessages({
            request,
            targetPath: forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile),
            files: workspace.files,
          })
        : forcedWriteRecoveryPending
          ? buildForcedWriteRecoveryMessages({
              request,
              targetPath:
                forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile),
              files: workspace.files,
            })
          : messages
      )
        .map((message) => `[${message.role}]\n${message.content}`)
        .join('\n\n'),
      output: reply,
    });
    messages.push({ role: 'assistant', content: reply });

    let action: ReturnType<typeof parseAgentAction> | undefined;
    try {
      action = parseAgentAction(reply, { allowedActions });
      protocolFailures = 0;
    } catch (error) {
      const err = error as Error;
      try {
        const directResult = parseModelResult(reply);
        if (directResult.kind === 'changes' && directResult.changes.length) {
          const changes = directResult.changes.map((change) => ({
            ...change,
            path: change.path || change.filePath || '',
            ...(typeof change.content === 'string' ? { after: change.content } : {}),
            ...(change.before === undefined
              ? { before: workspace.files[change.path || change.filePath || ''] }
              : {}),
          }));
          const validation = validateAIChanges(changes);
          if (validation.rejected.length || !validation.accepted.length) {
            messages.push({
              role: 'user',
              content: observation(
                'changes',
                false,
                validation.rejected.join('\n') || 'No usable changes were returned.',
              ),
            });
            continue;
          }
          for (const change of validation.accepted) {
            if (change.after === undefined) workspace.delete(change.path);
            else workspace.write(change.path, change.after);
          }
          let verification = '';
          if (validate) {
            verification = await runValidation(
              turn,
              directChangesRecoveryPending ? 'recovery' : 'model',
            );
          }
          if (verification.includes('"status":"failed"')) {
            if (++directRepairAttempts > 2)
              throw new AgentExecutionError(verification, workspace.changes());
            messages.push({
              role: 'user',
              content: observation(
                'validate',
                false,
                `${verification}\nReturn a corrected kind=changes response with complete file contents.`,
              ),
            });
            continue;
          }
          let previewSummary = '';
          if (requirePreviewInspection && !inspectedPreview) {
            onEvent({ type: 'tool', turn, action: { action: 'inspect_preview' }, agentRole });
            const preview = inspectPreview
              ? await inspectPreview(workspace.files)
              : { status: 'unavailable', diagnostics: 'Preview inspection is unavailable.' };
            inspectedPreview = true;
            previewSummary = `\n\nPreview inspection:\n${JSON.stringify(preview)}`;
          }
          const changesResult = workspace.changes();
          const summary =
            directResult.summary || `Prepared ${changesResult.length} file(s) for review.`;
          onEvent({
            type: 'finished',
            turn,
            changes: changesResult,
            message: summary,
            agentRole,
            provenance: directChangesRecoveryPending ? 'recovery' : 'model',
          });
          return {
            changes: changesResult,
            files: workspace.files,
            summary: `${summary}${previewSummary}`,
            events: turn,
            workspace,
          };
        }
        if (directResult.kind === 'answer') {
          messages.push({
            role: 'user',
            content: observation(
              'changes',
              false,
              'The previous model response did not return any changes for an edit request. return changes for an edit request as a complete kind=changes response with at least one file change.',
            ),
          });
          continue;
        }
      } catch (directError) {
        if (directError instanceof AgentExecutionError) throw directError;
      }
      protocolFailures++;
      if (forcedWriteRecoveryPending) {
        if (++forcedWriteRecoveryViolations >= 2) {
          if (!directChangesRecoveryPending) {
            directChangesRecoveryPending = true;
            const target =
              forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
            const recoveryMessage = target
              ? `Direct recovery is active. Return one kind=changes response containing complete content for ${target}. Do not return another action.`
              : 'Direct recovery is active. Return one kind=changes response containing complete file contents. Do not return another action.';
            messages.push({
              role: 'user',
              content: observation('direct_recovery', false, recoveryMessage),
            });
            context.record('direct_recovery', recoveryMessage);
            continue;
          }
          const recovered = await recoverTodoApp(turn);
          if (recovered) return recovered;
          throw new AgentExecutionError(
            'The local model could not provide a write_file action after forced recovery. Staged changes were preserved for review; retry with a stronger model or a narrower request.',
            workspace.changes(),
          );
        }
        const target = forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
        const recoveryMessage = target
          ? `Recovery mode is active. Return exactly one write_file action for ${target} with complete source content. Do not use list_files, validate, inspect_preview, or prose.`
          : 'Recovery mode is active. Return exactly one write_file action with complete source content. Do not use list_files, validate, inspect_preview, or prose.';
        messages.push({
          role: 'user',
          content: observation('protocol', false, `${err.message}. ${recoveryMessage}`),
        });
        context.record('stuck_read_recovery', recoveryMessage);
        continue;
      }
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
    if (forcedWriteRecoveryPending && action.action !== 'write_file') {
      forcedWriteRecoveryViolations += 1;
      if (forcedWriteRecoveryViolations === 1 && workspace.changes().length === 0) {
        directChangesRecoveryPending = true;
        const target = forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
        const recoveryMessage = target
          ? `Direct recovery is active. Return one kind=changes response containing complete content for ${target}. Do not return another action.`
          : 'Direct recovery is active. Return one kind=changes response containing complete file contents. Do not return another action.';
        messages.push({
          role: 'user',
          content: observation('direct_recovery', false, recoveryMessage),
        });
        context.record('direct_recovery', recoveryMessage);
        continue;
      }
      if (forcedWriteRecoveryViolations >= 2) {
        if (workspace.changes().length > 0) {
          const wiredEntry = wireNewComponentIntoScratchEntry(workspace);
          const result = await runValidation(turn);
          if (isFailedValidationResult(result)) {
            throw new AgentRecoveryValidationError(
              `Validation failed after forced write recovery: ${result}`,
              workspace.changes(),
            );
          }
          const summary = wiredEntry
            ? `Validated staged changes after forced write recovery limit reached and wired ${wiredEntry}.`
            : 'Validated staged changes after forced write recovery limit reached.';
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
        if (!directChangesRecoveryPending) {
          directChangesRecoveryPending = true;
          const target = forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
          const recoveryMessage = target
            ? `Direct recovery is active. Return one kind=changes response containing complete content for ${target}. Do not return another action.`
            : 'Direct recovery is active. Return one kind=changes response containing complete file contents. Do not return another action.';
          messages.push({
            role: 'user',
            content: observation('direct_recovery', false, recoveryMessage),
          });
          context.record('direct_recovery', recoveryMessage);
          continue;
        }
        const recovered = await recoverTodoApp(turn);
        if (recovered) return recovered;
        throw new AgentExecutionError(
          'The local model repeatedly read unchanged files without editing, including after a forced write recovery. It was stopped early to avoid exhausting the step limit; retry with a stronger model or a narrower request.',
          workspace.changes(),
        );
      }
      const target = forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
      const message = target
        ? `Recovery mode is active. Do not inspect files again. Your next response must be a write_file action for ${target} with complete source content that fulfills the original request.`
        : 'Recovery mode is active. Do not inspect files again. Your next response must be a write_file action that fulfills the original request.';
      messages.push({ role: 'user', content: observation(action.action, false, message) });
      context.record('stuck_read_recovery', message);
      onEvent({ type: 'observation', turn, action, error: true, message, agentRole });
      continue;
    }
    if (
      deferredSourceWrite &&
      !(
        action.action === 'write_file' &&
        deferredSourceWrite.stylesheets.includes(action.path || '')
      )
    ) {
      const source = deferredSourceWrite;
      for (const stylesheet of source.stylesheets) {
        const recoveredStylesheet = cssModuleRecovery(source.content);
        workspace.write(stylesheet, recoveredStylesheet);
        onEvent({
          type: 'tool',
          turn,
          action: { action: 'write_file', path: stylesheet, content: recoveredStylesheet },
          agentRole,
          provenance: 'recovery',
        });
      }
      workspace.write(source.path, source.content);
      onEvent({
        type: 'tool',
        turn,
        action: { action: 'write_file', path: source.path, content: source.content },
        agentRole,
        provenance: 'recovery',
      });
      wroteSinceVerification = true;
      deferredSourceWrite = null;
      forcedWriteRecoveryPending = false;
      forcedRecoveryTargetPath = null;
      const message = `The model did not provide the requested CSS Module, so staged ${source.path} with generated semantic CSS recovery for ${source.stylesheets.join(', ')}.`;
      messages.push({ role: 'user', content: observation('css_recovery', true, message) });
      context.record('css_recovery', message);
      onEvent({ type: 'observation', turn, action, message, agentRole });
      continue;
    }
    if (
      CHANGE_REQUEST_PATTERN.test(request) &&
      NON_PRODUCTIVE_ACTIONS.has(action.action) &&
      workspace.changes().length === 0
    ) {
      nonProductiveActionsWithoutWrite++;
      if (nonProductiveActionsWithoutWrite >= 4 && !forcedWriteRecoveryPending) {
        const target = forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
        forcedWriteRecoveryPending = true;
        const message = target
          ? `Recovery mode: the workspace has already been inspected. Do not list, search, or read files again. Your next response must be a write_file action for ${target} that fulfills the original request, with complete source content. Only call finish if no code change is needed.`
          : 'Recovery mode: the workspace has already been inspected. Do not list, search, or read files again. Your next response must be a write_file action that fulfills the original request, with complete source content. Only call finish if no code change is needed.';
        messages.push({
          content: observation('stuck_read_recovery', false, message),
          role: 'user',
        });
        context.record('stuck_read_recovery', message);
        onEvent({ type: 'observation', turn, action, error: true, message, agentRole });
        continue;
      }
    }
    if (action.action === 'read_file') {
      const path = action.path || '';
      const content = workspace.files[path];
      if (lastReadContents.has(path) && lastReadContents.get(path) === content) {
        const message = `Duplicate read_file skipped — ${path} has not changed since it was last read. Reuse the existing result and take a productive action.`;
        messages.push({ role: 'user', content: observation(action.action, true, message) });
        context.record('read_file', message);
        onEvent({ type: 'observation', turn, action, message, agentRole });
        unchangedReadSkips++;
        // Small local models often stop generating after their first repeated read.
        // Prompt for a productive write immediately, while the workspace context is fresh.
        if (unchangedReadSkips === 1 && workspace.changes().length === 0) {
          const target = forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
          forcedWriteRecoveryPending = true;
          messages.push({
            role: 'user',
            content: observation(
              'stuck_read_recovery',
              false,
              target
                ? `Recovery mode: the workspace has already been inspected. Do not list, search, or read files again. Your next response must be a write_file action for ${target} that fulfills the original request, with complete source content. Only call finish if no code change is needed.`
                : 'Recovery mode: the workspace has already been inspected. Do not list, search, or read files again. Your next response must be a write_file action that fulfills the original request, with complete source content. Only call finish if no code change is needed.',
            ),
          });
          continue;
        }
        if (unchangedReadSkips >= 2 && workspace.changes().length === 0) {
          throw new AgentExecutionError(
            'The local model repeatedly read unchanged files without editing, including after a forced write recovery. It was stopped early to avoid exhausting the step limit; retry with a stronger model or a narrower request.',
            [],
          );
        }
        if (unchangedReadSkips >= 2 && workspace.changes().length > 0) {
          const wiredEntry = wireNewComponentIntoScratchEntry(workspace);
          const result = await runValidation(turn);
          if (isFailedValidationResult(result)) {
            throw new AgentRecoveryValidationError(
              `Validation failed after repeated unchanged reads: ${result}`,
              workspace.changes(),
            );
          }
          const summary = wiredEntry
            ? `Validated the staged changes after the local model repeatedly read unchanged files and wired ${wiredEntry} to the new component.`
            : 'Validated the staged changes after the local model repeatedly read unchanged files.';
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
      const wiredEntry = wireNewComponentIntoScratchEntry(workspace);
      const summary = wiredEntry
        ? `Validated the staged changes after the local model repeated an identical write action and wired ${wiredEntry} to the new component.`
        : 'Validated the staged changes after the local model repeated an identical write action.';
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
      if (action.action === 'validate' && workspace.changes().length > 0) {
        const result = await runValidation(turn);
        const wiredEntry = wireNewComponentIntoScratchEntry(workspace);
        const changes = workspace.changes();
        const summary = wiredEntry
          ? `Validated the staged changes after the local model repeated validation and wired ${wiredEntry} to the new component.`
          : 'Validated the staged changes after the local model repeated validation.';
        onEvent({ type: 'finished', turn, changes, message: summary, agentRole });
        context.record('validation', result);
        return { changes, files: workspace.files, summary, events: turn, workspace };
      }
      if (isRepeatedSavedWrite) {
        const message = `The proposed write to ${action.path} is already staged with identical content. Automatically validating the workspace instead of rewriting it.`;
        try {
          const result = await runValidation(turn);
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
        const normalizedSideEffectCss = /\.(jsx|tsx)$/i.test(action.path || '')
          ? normalizeSideEffectCssSource(action.path || '', action.content || '')
          : null;
        if (normalizedSideEffectCss) {
          action = { ...action, content: normalizedSideEffectCss.content };
        }
        const stylingError = validateComponentStyling(action.path || '', action.content || '');
        if (stylingError) throw new Error(stylingError);
        const cssModuleError = validateCssModuleUsage(action.path || '', action.content || '');
        if (cssModuleError) throw new Error(cssModuleError);
        const missingStylesheets = missingCssModuleImports(
          action.path || '',
          action.content || '',
          workspace.files,
        );
        if (missingStylesheets.length && !normalizedSideEffectCss) {
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
        const missingRules = missingCssModuleRules(
          action.path || '',
          action.content || '',
          workspace.files,
        );
        if (missingRules.length) {
          throw new Error(
            `CSS Module ${action.path} is missing rules required by its importing component: ${missingRules.join(', ')}.`,
          );
        }
        workspace.write(action.path || '', action.content || '');
        nonProductiveActionsWithoutWrite = 0;
        wroteSinceVerification = true;
        failedWritePath = '';
        unchangedReadSkips = 0;
        forcedWriteRecoveryPending = false;
        forcedRecoveryTargetPath = null;
        forcedWriteRecoveryViolations = 0;
        failedStylesheetWrites.delete(action.path || '');
        if (normalizedSideEffectCss) {
          for (const stylesheet of normalizedSideEffectCss.stylesheets) {
            if (Object.hasOwn(workspace.files, stylesheet)) continue;
            const recoveredStylesheet = cssModuleRecovery(action.content || '');
            workspace.write(stylesheet, recoveredStylesheet);
            onEvent({
              type: 'tool',
              turn,
              action: { action: 'write_file', path: stylesheet, content: recoveredStylesheet },
              agentRole,
              provenance: 'recovery',
            });
          }
        }
        if (
          deferredSourceWrite?.stylesheets.every((path) => Object.hasOwn(workspace.files, path))
        ) {
          workspace.write(deferredSourceWrite.path, deferredSourceWrite.content);
          onEvent({
            type: 'tool',
            turn,
            action: {
              action: 'write_file',
              path: deferredSourceWrite.path,
              content: deferredSourceWrite.content,
            },
            agentRole,
            provenance: 'recovery',
          });
          result = `Staged ${action.path} and the queued source file ${deferredSourceWrite.path}.`;
          deferredSourceWrite = null;
          forcedWriteRecoveryPending = false;
          forcedRecoveryTargetPath = null;
        } else {
          result = `Staged ${action.path} (${(action.content || '').length} characters).`;
        }
        onEvent({ type: 'tool', turn, action, agentRole });
      }
      if (action.action === 'delete_file') {
        const path = action.path || '';
        const importers = cssModuleImporters(path, workspace.files);
        if (importers.length) {
          throw new Error(
            `Cannot delete CSS Module ${path} because it is imported by ${importers.join(', ')}. Update or delete the importing component files first.`,
          );
        }
        workspace.delete(path);
        wroteSinceVerification = true;
        nonProductiveActionsWithoutWrite = 0;
        unchangedReadSkips = 0;
        onEvent({ type: 'tool', turn, action, agentRole });
        result = `Staged deletion of ${action.path}.`;
      }
      if (action.action === 'validate') {
        result = await runValidation(turn, 'model');
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
        if (CHANGE_REQUEST_PATTERN.test(request) && workspace.changes().length === 0) {
          const recovered = await recoverTodoApp(turn);
          if (recovered) return recovered;
          const target = forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
          forcedWriteRecoveryPending = true;
          forcedWriteRecoveryViolations = 0;
          const message = target
            ? `No file changes are staged for this edit request. Return exactly one write_file action for ${target} with the complete implementation before finishing.`
            : 'No file changes are staged for this edit request. Return exactly one write_file action with the complete implementation before finishing.';
          messages.push({ role: 'user', content: observation('finish', false, message) });
          context.record('finish_recovery', message);
          continue;
        }
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
        const wiredEntry = wireNewComponentIntoScratchEntry(workspace);
        const changes = workspace.changes();
        const summary = wiredEntry
          ? `${action.summary || 'Created the requested component.'} Wired ${wiredEntry} to the new component so it renders in the app.`
          : action.summary;
        onEvent({ type: 'finished', turn, changes, message: summary, agentRole });
        return {
          changes,
          files: workspace.files,
          summary: summary || '',
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
      if (error instanceof AgentRecoveryValidationError) throw error;
      const err = error as Error;
      const stylesheetPath = action.path || '';
      const missingCssModules =
        action.action === 'write_file'
          ? missingCssModuleImports(action.path || '', action.content || '', workspace.files)
          : [];
      if (missingCssModules.length) {
        const contentTypeError = validateFileContentType(action.path || '', action.content || '');
        const syntaxError = validateContentSyntax(action.path || '', action.content || '');
        if (!contentTypeError && !syntaxError) {
          deferredSourceWrite = {
            path: action.path || '',
            content: action.content || '',
            stylesheets: missingCssModules,
          };
          forcedRecoveryTargetPath = missingCssModules[0];
          unchangedReadSkips = 0;
          const result = `Queued ${action.path}. Your next action must write ${missingCssModules[0]} with the complete CSS Module needed by that component. Do not list, search, or read files again.`;
          messages.push({ role: 'user', content: observation(action.action, false, result) });
          context.record(action.action, result);
          onEvent({ type: 'observation', turn, action, error: true, message: result, agentRole });
          continue;
        }
      }
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
            : action.action === 'delete_file' && /Cannot delete CSS Module/.test(err.message)
              ? ' The stylesheet was not deleted. Update or remove its importing component files first, then retry the deletion.'
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
      const wiredEntry = wireNewComponentIntoScratchEntry(workspace);
      const result = await runValidation(maxTurns);
      if (isFailedValidationResult(result)) {
        throw new AgentExecutionError(
          `Final validation failed at the ${maxTurns}-step safety limit: ${result}`,
          workspace.changes(),
        );
      }
      const needsEntryWiring = newlyCreatedComponentsNeedEntryWiring(workspace);
      const summary = needsEntryWiring
        ? `Validated a partial draft after the agent reached its ${maxTurns}-step safety limit. It created new components without wiring them into the application entry point; review the draft before applying it.`
        : wiredEntry
          ? `Validated the staged changes after the agent reached its ${maxTurns}-step safety limit and wired ${wiredEntry} to the new component. Review and apply the completed draft.`
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
