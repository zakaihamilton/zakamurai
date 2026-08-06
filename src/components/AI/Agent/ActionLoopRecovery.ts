import type { WebLLMMessage } from '@/components/AI/types';
import { getWebLLMStore } from '../WebLLMState';
import type { AgentWorkspace } from './Workspace';

export const AGENT_CONTEXT_WINDOW_SIZE = 4096;
export const AGENT_GENERATION_TOKENS = 1800;
export const AGENT_RECOVERY_TOKENS = 2200;
export const LIGHTWEIGHT_AGENT_GENERATION_TOKENS = 1800;
export const LIGHTWEIGHT_AGENT_RECOVERY_TOKENS = 2400;

export const loadAskWebLLM = async () => (await import('../WebLLMAPI')).askWebLLM;

export const APP_ENTRY_PATHS = new Set([
  'src/App.jsx',
  'src/App.tsx',
  'src/main.jsx',
  'src/main.tsx',
  'src/index.jsx',
  'src/index.tsx',
]);

export const recoveryWritePath = (
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

export const newlyCreatedComponentsNeedEntryWiring = (workspace: AgentWorkspace): boolean =>
  workspace
    .changes()
    .some(
      (change) =>
        change.before === undefined &&
        /^src\/components\/[^/]+\.(?:jsx|tsx)$/i.test(change.path) &&
        ![...APP_ENTRY_PATHS].some((path) => workspace.original[path] !== workspace.files[path]),
    );

export const getModelDownloadProgress = (modelId: string): string | null => {
  const store = getWebLLMStore();
  const engines = store?.engines || {};
  const modelIds = [modelId, store?.activeModelId].filter(
    (id, index, ids): id is string => typeof id === 'string' && ids.indexOf(id) === index,
  );
  const downloadingEngine = modelIds
    .map((id) => engines[id])
    .find((engine) => engine?.status === 'downloading');
  if (!downloadingEngine) return null;
  return downloadingEngine.progressText
    ? `the model is downloading — ${downloadingEngine.progressText}`
    : 'the model is downloading; waiting for model files';
};

export const wireNewComponentIntoScratchEntry = (workspace: AgentWorkspace): string | null => {
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

export const CHANGE_REQUEST_PATTERN =
  /\b(?:add|build|change|create|delete|design|fix|implement|improve|make|modify|refactor|remove|rename|replace|style|update)\b/i;

export const isLightweightAgentModel = (model: string): boolean =>
  /(?:0\.8|1\.5|1\.7|2)B(?:-|$)/i.test(model);

export const LIGHTWEIGHT_AGENT_SYSTEM_PROMPT = `
You are a small local coding model. Reply with exactly one response and no explanation.
For a create, build, fix, or update request, write the application source immediately when
workspace context is supplied. Do not list, search, or read files again.

For source code, reply with ONLY a labelled code fence containing the complete file:
\`\`\`jsx
complete source content here
\`\`\`
Do not return JSON write_file metadata. Do not put source inside a JSON content field.
The host saves the fence to the correct project path.

For create or build requests, return a complete working implementation. When the UI is
interactive, include React state and event handlers, and prefer importing styles from
"./App.module.css" with className={styles.app} / styles.button. Never leave "New Project"
or "Start coding here..." text. Never claim the app was only scaffolded.

Visual contract: the preview has its own theme and may otherwise inherit a dark host
background. In the root CSS Module, reset :global(:root), :global(body), and :global(#root)
(margin, padding, min-height, background, and color), define explicit background/foreground
tokens, and apply readable colors to every heading, paragraph, input, button, placeholder, and
status. Use WCAG AA contrast (4.5:1 for normal text, 3:1 for large text and controls); never
place black text on a dark surface or light text on a light surface. If the request does not
specify a theme, use a light neutral surface with dark text and one accent. Give inputs and
buttons explicit backgrounds, borders, and focus-visible styles instead of relying on browser
defaults. Do not use blue everywhere: choose a warm neutral or editorial palette with charcoal text and one intentional non-blue accent such as terracotta, amber, plum, or green, and vary surface, control, and action colors deliberately.

For interactive requests, the rendered result must visibly include its primary controls and
status/content states, connected to React state and event handlers. A heading alone is not an
implementation. Every referenced control needs a real visible size, readable text/state, and
explicit spacing, background, border, and focus styles. Never collapse controls into thin bars
or hide them with zero/near-zero dimensions, display:none, or visibility:hidden.

When an event handler derives a result from a state update, compute the next value first and use
that value for validation, status, or side effects before calling the state setter. React state
updates are asynchronous, so reading the old state after setState can produce incorrect UI.
Keep callbacks that access hook state or setters inside the component, and mentally exercise every
primary control plus reset, submit, empty, success, and error paths before finishing.

After a successful write, use exactly one of:
{"action":"validate"}
{"action":"finish","summary":"brief result"}
`.trim();

export const CONTEXT_READY_AGENT_INSTRUCTIONS = `
IMPORTANT: The manager has already inspected the workspace and supplied the relevant file
contents below. For an edit request, your next response must be exactly one write_file or
delete_file action. Do not call list_files, search_workspace, search_semantic, or read_file
again. For source code, use the fenced write format: put the one-line JSON metadata first and
the complete file in one correctly labelled code fence. After a successful write, validate and
then finish. Never return a plan or prose.
`.trim();

export const LIGHTWEIGHT_CONTEXT_READY_INSTRUCTIONS = `
IMPORTANT: The manager has already inspected the workspace and supplied the relevant file
contents below. For an edit request, reply with ONLY a labelled code fence containing the
complete source for the target file. Include state and event handlers when the UI is
interactive, and prefer a co-located CSS Module. Do not return JSON write_file metadata,
list files, search, read files, or explain. Do not leave starter-template placeholder text.
After a successful write, validate and then finish.
`.trim();

export const isScratchEntry = (content: string | undefined): boolean =>
  Boolean(
    content && /<h1>New Project<\/h1>/.test(content) && /Start coding here\.\.\./.test(content),
  );

const sourceFenceLanguage = (path: string): string => {
  const extension = path.split('.').pop()?.toLowerCase();
  if (extension === 'js') return 'js';
  if (extension === 'ts') return 'ts';
  if (extension === 'tsx') return 'tsx';
  if (extension === 'json') return 'json';
  if (extension === 'html') return 'html';
  return 'jsx';
};

export const writeRecovery = (
  path: string,
  message: string,
  files: Record<string, string>,
): string => {
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

export type BuildUserRequestOptions = {
  request: string;
  scope?: string;
  activeFile?: string | null;
  selectedLines?: number[];
  priorContext?: string;
};

export const buildUserRequest = ({
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
    ? priorContext
      ? '\nImplementation requirement: workspace context has already been collected. Make a write_file or delete_file edit now before using validate, inspect_preview, run_project_check, or finish. Do not repeat the workspace inspection.'
      : '\nImplementation requirement: this is a change request. Make at least one write_file or delete_file edit before using validate, inspect_preview, run_project_check, or finish. After one brief inspection, implement the request instead of continuing to inspect.'
    : '';
  const requestBlock = `${scopeBlock}${implementationGuidance}`;
  if (!priorContext) return requestBlock;
  return `${requestBlock}\n\nPrior conversation context:\n${priorContext}`;
};

const extractConversationalPrior = (priorContext: string): string | null => {
  const conversational = priorContext
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter(
      (block) =>
        !/^\[(?:list_files|read_file|search_workspace|search_semantic|prior)\]/i.test(block) &&
        !/^---\s+\S/.test(block),
    );
  if (!conversational.length) return null;
  return conversational.join('\n\n').slice(0, 1200);
};

export const buildContextReadyUserRequest = ({
  request,
  targetPath,
  files,
  priorContext = '',
  lightweight = false,
}: {
  request: string;
  targetPath: string;
  files: Record<string, string>;
  priorContext?: string;
  lightweight?: boolean;
}): string => {
  const stylesheetPath = targetPath.replace(/\.(jsx|tsx)$/i, '.module.css');
  const contextPaths = [targetPath, stylesheetPath, 'package.json'].filter(
    (path, index, paths) => Object.hasOwn(files, path) && paths.indexOf(path) === index,
  );
  const fileContext = contextPaths.length
    ? contextPaths.map((path) => `--- ${path} ---\n${files[path]}`).join('\n\n')
    : 'No relevant source file exists yet.';
  const conversation = extractConversationalPrior(priorContext);
  const nextStep = lightweight
    ? `Your next response must be ONLY a labelled code fence with the complete source for ${targetPath}. Do not return JSON.`
    : `Your next response must be exactly one write_file action for ${targetPath}.`;
  return [
    `Request: ${request}`,
    ...(conversation ? [`Prior conversation:\n${conversation}`] : []),
    'The workspace has already been inspected. Do not list, search, or read files.',
    nextStep,
    'Use the supplied files as context and return the complete implementation now.',
    fileContext,
  ].join('\n\n');
};

const buildFenceOnlyRecoveryMessages = ({
  request,
  targetPath,
  files,
  incompleteWrite = false,
}: {
  request: string;
  targetPath: string | null;
  files: Record<string, string>;
  incompleteWrite?: boolean;
}): WebLLMMessage[] => {
  const recoveryPath = targetPath || 'src/App.jsx';
  const recoveryLanguage = sourceFenceLanguage(recoveryPath);
  const fenceFormat = [`\`\`\`${recoveryLanguage}`, 'complete source content here', '```'].join(
    '\n',
  );
  const targetContent = targetPath ? files[targetPath] : undefined;
  const isScratch = targetPath ? isScratchEntry(targetContent) : false;
  const context =
    targetPath && targetContent !== undefined && !isScratch
      ? `Current contents of ${targetPath}:\n${targetContent}`
      : targetPath
        ? `Write the complete implementation for ${targetPath}.`
        : 'Write the complete application entry source.';
  const incompleteWriteHint = incompleteWrite
    ? 'The previous reply had write_file metadata without source content. Reply with ONLY the labelled code fence — no JSON line.'
    : null;

  return [
    {
      role: 'system',
      content: `You are in emergency write mode. Reply with ONLY this labelled code fence and nothing else:\n${fenceFormat}\nReplace the placeholder with complete working source. Do not return JSON, list files, validate, finish, or explain.`,
    },
    {
      role: 'user',
      content: [
        `Original request: ${request}`,
        ...(incompleteWriteHint ? [incompleteWriteHint] : []),
        `Required destination: ${recoveryPath}`,
        context,
        `Return only:\n${fenceFormat}`,
      ].join('\n\n'),
    },
  ];
};

export const buildForcedWriteRecoveryMessages = ({
  request,
  targetPath,
  files,
  lightweight = false,
  incompleteWrite = false,
}: {
  request: string;
  targetPath: string | null;
  files: Record<string, string>;
  lightweight?: boolean;
  incompleteWrite?: boolean;
}): WebLLMMessage[] => {
  if (lightweight) {
    return buildFenceOnlyRecoveryMessages({
      request,
      targetPath,
      files,
      incompleteWrite,
    });
  }

  const targetContent = targetPath ? files[targetPath] : undefined;
  const context = targetPath
    ? `Current contents of ${targetPath}:\n${targetContent ?? '(file does not exist yet)'}`
    : 'No existing application entry file was identified. Choose a project-relative entry path.';
  const recoveryPath = targetPath || 'src/App.jsx';
  const recoveryLanguage = sourceFenceLanguage(recoveryPath);
  const writeFormat = [
    `{"action":"write_file","path":"${recoveryPath}","reason":"implement the request"}`,
    `\`\`\`${recoveryLanguage}`,
    'complete source content here',
    '```',
  ].join('\n');
  const recoveryInstruction = targetPath
    ? `Recovery mode is active. Your next response must be a write_file action for ${targetPath} with complete source content. Return exactly one write_file action for ${targetPath}.`
    : 'Recovery mode is active. Your next response must be a write_file action with complete source content. Return exactly one write_file action.';
  const incompleteWriteHint = incompleteWrite
    ? 'The previous reply had write_file metadata without source content. Include the complete file body in the same response as a labelled code fence immediately after the JSON line.'
    : null;

  return [
    {
      role: 'system',
      content: `You are in emergency write mode. Ignore normal inspection guidance: the workspace has already been inspected. Return exactly one write_file action now using this exact format:\n${writeFormat}\nReplace only the source fence contents. Do not put source code in a JSON content field. Do not list, search, read, validate, inspect the preview, finish, or explain.`,
    },
    {
      role: 'user',
      content: [
        `Original request: ${request}`,
        ...(incompleteWriteHint ? [incompleteWriteHint] : []),
        recoveryInstruction,
        targetPath
          ? `Required destination: ${targetPath}`
          : 'Required destination: choose the appropriate application source file.',
        context,
        `Implement the original request with complete source content. Return exactly one write_file action and nothing else. Use this format:\n${writeFormat}`,
      ].join('\n\n'),
    },
  ];
};

export const buildDirectChangesRecoveryMessages = ({
  request,
  targetPath,
  files,
  lightweight = false,
}: {
  request: string;
  targetPath: string | null;
  files: Record<string, string>;
  lightweight?: boolean;
}): WebLLMMessage[] => {
  if (lightweight) {
    return buildFenceOnlyRecoveryMessages({ request, targetPath, files });
  }

  const context = targetPath
    ? `Current contents of ${targetPath}:\n${files[targetPath] ?? '(file does not exist yet)'}`
    : 'No existing application entry file was identified. Choose an appropriate project-relative path.';
  const recoveryPath = targetPath || 'src/App.jsx';
  const recoveryLanguage = sourceFenceLanguage(recoveryPath);
  const fencedWriteFormat = [
    `{"action":"write_file","path":"${recoveryPath}","reason":"implement the request"}`,
    `\`\`\`${recoveryLanguage}`,
    'complete source content here',
    '```',
  ].join('\n');
  return [
    {
      role: 'system',
      content: `You are in direct recovery mode. Return exactly one complete change response. Prefer this parser-safe write format:\n${fencedWriteFormat}\nYou may use the kind "changes" JSON format below when every file content is correctly JSON-escaped. Do not list files, read files, or explain.`,
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
        `For source code, the safer accepted alternative is:\n${fencedWriteFormat}`,
        'Implement the original request now. Include every file required for the implementation and no placeholder content.',
      ].join('\n\n'),
    },
  ];
};

export const isIncompleteWriteError = (message: string): boolean =>
  /write_file requires string content/i.test(message);

const GENERIC_FINISH_SUMMARY =
  /further development|start coding|proceed with|\/dist\b|build sequence|necessary files|successfully (?:created|built)(?:\s+\w+){0,4}\s+validat/i;

/** Replace scaffold-style finish blurbs with a request-grounded summary. */
export const normalizeFinishSummary = ({
  summary,
  request,
  changeCount,
  wiredEntry = null,
}: {
  summary?: string | null;
  request: string;
  changeCount: number;
  wiredEntry?: string | null;
}): string => {
  const trimmed = typeof summary === 'string' ? summary.trim() : '';
  const clipped = request.trim().replace(/\s+/g, ' ').slice(0, 80);
  const useRequestSummary =
    CHANGE_REQUEST_PATTERN.test(request) &&
    changeCount > 0 &&
    (!trimmed || GENERIC_FINISH_SUMMARY.test(trimmed));
  const base = useRequestSummary
    ? `Implemented “${clipped}” and validated the build.`
    : trimmed || (changeCount > 0 ? `Prepared ${changeCount} file(s) for review.` : 'Done.');
  return wiredEntry
    ? `${base} Wired ${wiredEntry} to the new component so it renders in the app.`
    : base;
};
