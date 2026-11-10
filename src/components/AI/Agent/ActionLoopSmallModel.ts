const NEW_APP_GENERATION_PATTERN =
  /\b(?:build|create|generate|scaffold|start|make)\b.*\b(?:app|application|dashboard|form|game|interface|layout|list|menu|page|screen|table|todo|ui|widget|website)\b/i;

export const isNewAppGenerationRequest = (request: string): boolean =>
  NEW_APP_GENERATION_PATTERN.test(request) && !/\b(?:existing|current|this)\b/i.test(request);

export const isLightweightAgentModel = (model: string): boolean =>
  /(?:0\.5|0\.8|1\.5|1\.7|2)B(?:-|$)/i.test(model);

export const isMidTierAgentModel = (model: string): boolean => /(?:3)B(?:-|$)/i.test(model);

export const MIDTIER_CONTEXT_READY_ACTIONS = ['write_file', 'delete_file', 'finish'] as const;

export function restrictLowerModelActions(actions: string[]): string[] {
  const next = actions.filter((action) => action !== 'replace_file_content');
  return next.length ? next : ['write_file', 'finish'];
}

export function restrictMidTierContextReadyActions(actions: string[]): string[] {
  const allowed = new Set<string>(MIDTIER_CONTEXT_READY_ACTIONS);
  const next = actions.filter((action) => allowed.has(action));
  return next.includes('write_file') ? next : [...MIDTIER_CONTEXT_READY_ACTIONS];
}

export const isTodoAppRequest = (request: string): boolean =>
  /\b(?:todo|to-do|task[-\s]+(?:list|manager|management|planner))\b/i.test(request);

export const isClockAppRequest = (request: string): boolean =>
  /\b(?:clock|timer|stopwatch|countdown)\b/i.test(request);

export const isNotesAppRequest = (request: string): boolean => {
  if (isTodoAppRequest(request)) return false;
  if (/\b(?:notes?|memo(?:s|pad)?|notebook)\b/i.test(request)) return true;
  if (/\b(?:list_files|list\s+(?:the\s+)?files|project\s+checks?)\b/i.test(request)) return false;
  return (
    /\b(?:item\s+list|simple\s+list)\b/i.test(request) ||
    (/\b(?:create|build|make|add|implement)\b/i.test(request) &&
      /\blist\b/i.test(request) &&
      !/\b(?:file|files|check|checks)\b/i.test(request))
  );
};

export const isBoardGameRequest = (request: string): boolean =>
  /\b(?:tic[\s-]?tac[\s-]?toe|board\s*game|game\s*board|checkers?|chess|connect\s*four)\b/i.test(
    request,
  );

export const isKnownInteractiveAppRequest = (request: string): boolean =>
  isTodoAppRequest(request) ||
  isClockAppRequest(request) ||
  isNotesAppRequest(request) ||
  isBoardGameRequest(request);

/** Host patches for known small-model UI failures, not every fulfillment write. */
export const shouldSalvageGeneratedInteractiveSource = (
  request: string,
  fulfillmentModel: boolean,
): boolean =>
  isNewAppGenerationRequest(request) || (fulfillmentModel && isKnownInteractiveAppRequest(request));

export const INTERACTIVE_GENERATION_GUIDANCE = `
For interactive UI include React state, handlers, and visible empty/success/error states.
Render the requested content visibly, including its primary controls and current status.
Keep React state and event handlers inside the component and make the controls change that state.
Every bare JSX event-handler reference (such as onClick={handleSave}) must name a function declared in the same component scope or a supplied prop; never reference an undeclared handler.
Never leave starter placeholder text. Compute derived values before setState.
For grids, lists, and games, update the targeted item or cell by index instead of appending a new item; compute derived status from the next state before calling setters.
For turn-based interactions, do not guard the handler against one hard-coded player or value; allow each active turn to act unless an explicit opponent rule is implemented.
Include an accessible reset, clear, or restart control whenever the interaction has a restartable state.
If a mapped root element itself has onClick (for example a board cell), make that element a <button type="button">. Nested controls inside a list item are already fine.
`.trim();

export const buildDeclarationRecoveryGuidance = (path: string, message: string): string => {
  const language = path.split('.').pop()?.toLowerCase() || 'jsx';
  if (/undeclared (?:event handlers|functions)\b|\(also:/.test(message))
    return ` The rejected source was not staged. Do not patch one missing name at a time. Regenerate the complete ${path} from scratch in one ${language} source fence, preserve the requested behavior, and declare every referenced event handler, render helper, and state value before using it. Check all JSX handler references and function calls before responding; do not return a partial repair or prose.`;
  const missingEventHandler = /references undeclared event handler '([^']+)'/i.exec(message);
  if (missingEventHandler)
    return ` The rejected source was not staged. Define the missing event handler ${missingEventHandler[1]} inside the component, or remove the handler. Return the complete ${path} in one ${language} source fence; do not return a partial render branch or prose.`;
  const missingFunction = /calls undeclared function '([^']+)'/i.exec(message);
  if (missingFunction)
    return ` The rejected source was not staged. Define the missing helper ${missingFunction[1]} before it is called, or remove the call. Return the complete ${path} in one ${language} source fence; do not return a partial render branch or prose.`;
  return '';
};

export const shouldRegenerateFailedInteractiveSource = (
  request: string,
  lightweight: boolean,
  diagnostic: string,
): boolean =>
  lightweight &&
  isNewAppGenerationRequest(request) &&
  /undeclared (?:event handler|function|state setter)/i.test(diagnostic);

export const TODO_APP_GENERATION_GUIDANCE = `
For todo and task-list requests, create a polished planner in a small component set:
- Keep state and derived counts in the supplied app entry. Put task entry in src/components/TodoForm.jsx and filtering/list rows in src/components/TodoList.jsx.
- Create a co-located CSS Module for the app entry, TodoForm, and TodoList. Each component must default-import its module as styles and use styles.* classes.
- Keep stable task ids; use a controlled form; support add, toggle, delete, clear completed, All/Active/Completed filter tabs, remaining count, and a helpful empty state.
- MANDATORY todo repair checklist: include a controlled text input or textarea, a visible Add/Create submit control wired to insertion, an explicit empty state, and working add/toggle/delete/clear/filter/count behavior. Preserve all CSS Module imports, do not import App.css, and do not define a JavaScript styles object.
- Use compact responsive rows, a warm paper-and-ink palette with a terracotta accent, clear type, and visible hover/focus states. Do not import App.css or use inline styles.
`.trim();

export const validateModularGenerationFiles = (
  request: string,
  targetPath: string,
  changes: Array<{
    path?: string;
    filePath?: string;
    content?: string;
    after?: string;
  }>,
): string[] => {
  const contentByPath = new Map<string, string>(
    changes.map((change): [string, string] => [
      change.path || change.filePath || '',
      typeof change.content === 'string' ? change.content : change.after || '',
    ]),
  );
  const paths = [...contentByPath.keys()];
  const changedPaths = new Set(paths);
  const appStylesheetPath = targetPath.replace(/\.(?:[jt]sx?)$/i, '.module.css');
  const issues = [
    ...(!changedPaths.has(targetPath) ? [targetPath] : []),
    ...(!changedPaths.has(appStylesheetPath) ? [appStylesheetPath] : []),
  ];
  issues.push(
    ...paths.filter((path) => /\.css$/i.test(path) && !/\.module\.css$/i.test(path)),
  );
  const componentPaths = paths.filter((path) => /^src\/components\/.+\.(?:[jt]sx?)$/i.test(path));
  const requiredTodoComponentNames = isTodoAppRequest(request) ? ['TodoForm', 'TodoList'] : [];

  if (!componentPaths.length) issues.push('at least one component under src/components/');
  if (componentPaths.length > 2) issues.push('no more than two subcomponents');
  for (const name of requiredTodoComponentNames) {
    const matchingComponent = componentPaths.some(
      (path) => path.split('/').pop()?.replace(/\.(?:[jt]sx?)$/i, '') === name,
    );
    if (!matchingComponent) {
      issues.push(`src/components/${name}.jsx or .tsx`);
    }
  }

  for (const path of componentPaths) {
    const stylesheetPath = path.replace(/\.(?:[jt]sx?)$/i, '.module.css');
    if (!changedPaths.has(stylesheetPath)) issues.push(stylesheetPath);
  }

  const relativeSpecifier = (fromPath: string, toPath: string): string => {
    const from = fromPath.split('/').slice(0, -1);
    const to = toPath.split('/');
    let common = 0;
    while (common < from.length && common < to.length && from[common] === to[common]) common++;
    const relative = [...Array(from.length - common).fill('..'), ...to.slice(common)].join('/');
    return relative.startsWith('.') ? relative : `./${relative}`;
  };
  const imports = (source: string) =>
    [...source.matchAll(/\bimport\s+([A-Za-z_$][\w$]*)\s+from\s*["']([^"']+)["']/g)];
  const appSource = contentByPath.get(targetPath) || '';

  for (const path of [targetPath, ...componentPaths]) {
    const stylesheetPath = path.replace(/\.(?:[jt]sx?)$/i, '.module.css');
    const stylesheetSpecifier = relativeSpecifier(path, stylesheetPath);
    const source = contentByPath.get(path) || '';
    const hasStylesImport = imports(source).some(
      (match) => match[1] === 'styles' && match[2] === stylesheetSpecifier,
    );
    const classNames = [
      ...source.matchAll(
        /\bclassName\s*=\s*\{\s*styles(?:\.([A-Za-z_$][\w$]*)|\[\s*["']([^"']+)["']\s*\])/g,
      ),
    ].map((match) => match[1] || match[2]);
    const cssContent = (contentByPath.get(stylesheetPath) || '').replace(/\/\*[\s\S]*?\*\//g, '');
    const cssClassNames = new Set(
      [...cssContent.matchAll(/\.([A-Za-z_-][\w-]*)/g)].map((match) => match[1]),
    );
    const hasMatchingClassRule = classNames.some((name) => cssClassNames.has(name));
    if (!hasStylesImport || !hasMatchingClassRule) {
      issues.push(
        `${path} must import ${stylesheetPath} as styles and use class names defined in that CSS Module`,
      );
    }
  }

  for (const path of componentPaths) {
    const componentName =
      path
        .split('/')
        .pop()
        ?.replace(/\.(?:[jt]sx?)$/i, '') || '';
    const moduleSpecifier = relativeSpecifier(targetPath, path.replace(/\.[^.]+$/, ''));
    const extension = path.split('.').pop() || '';
    const componentImport = imports(appSource).find(
      (match) =>
        match[2] === moduleSpecifier || match[2] === `${moduleSpecifier}.${extension}`,
    );
    const importedName = componentImport?.[1];
    const escapedName = importedName?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isRendered = escapedName
      ? new RegExp(
          `<${escapedName}(?=[\\s/>])|\\b(?:React\\.)?createElement\\(\\s*${escapedName}\\b`,
        ).test(appSource)
      : false;
    if (!importedName || !isRendered) {
      issues.push(`the app entry must import and render ${componentName} from ${path}`);
    }
  }

  return [...new Set(issues)];
};

export const CLOCK_APP_GENERATION_GUIDANCE = `
For clock, timer, or stopwatch requests:
- Keep the displayed time in React state and drive it with setInterval or setTimeout from start/stop controls.
- Show the current or remaining time visibly. Include start or pause and reset. Clear the interval on stop and unmount.
- Do not hard-code a frozen time display with no ticking behavior.
`.trim();

export const NOTES_APP_GENERATION_GUIDANCE = `
For notes, memo, or list requests:
- Keep notes in React state with a controlled title or body field, add, select/edit, and delete.
- Include a visible empty state, a controlled input or textarea, and a working Add/Save control.
- Define every render helper before calling it; never call a placeholder such as renderEditState unless its complete function exists.
- Import the co-located CSS Module as styles, use styles.* for local classes, and never import App.css or define a JavaScript styles object.
- Keep every render branch complete and return a working interface instead of a heading-only shell.
`.trim();

export const BOARD_GAME_GENERATION_GUIDANCE = `
For board or turn-based game requests:
- Model the board as an indexed collection and update the targeted cell by index; do not append a new cell.
- Allow each active turn to act. Include reset or restart. Mapped clickable cells must be <button type="button">.
`.trim();

/**
 * Compact starter skeleton for lightweight (0.5B–2B) models so they fill in a valid
 * structure rather than guessing React imports, CSS Module bindings, or default exports.
 */
export const buildArchetypeSkeleton = (
  request: string,
  targetPath = 'src/App.jsx',
): string | null => {
  if (!isNewAppGenerationRequest(request) && !isKnownInteractiveAppRequest(request)) return null;
  const baseName =
    targetPath
      .split('/')
      .pop()
      ?.replace(/\.(?:jsx|tsx)$/i, '') || 'App';
  const componentName = /^[A-Z][A-Za-z0-9_$]*$/.test(baseName) ? baseName : 'App';
  const moduleSuffix = '.module.css';
  return [
    'Required module skeleton (expand with full state, handlers, and JSX controls):',
    "import { useState } from 'react';",
    `import styles from './${baseName}${moduleSuffix}';`,
    `export default function ${componentName}() { /* state, handlers, return (<main className={styles.app}>...</main>) */ }`,
  ].join('\n');
};

export const generationGuidanceForRequest = (
  request: string,
  {
    interactiveContract = false,
    targetPath,
    lightweight = false,
    modularGeneration = false,
  }: {
    interactiveContract?: boolean;
    targetPath?: string;
    lightweight?: boolean;
    modularGeneration?: boolean;
  } = {},
): string[] => {
  const skeleton =
    lightweight &&
    !modularGeneration &&
    (interactiveContract || isKnownInteractiveAppRequest(request))
      ? buildArchetypeSkeleton(request, targetPath)
      : null;
  return [
    ...(interactiveContract ? [INTERACTIVE_GENERATION_GUIDANCE] : []),
    ...(isTodoAppRequest(request) ? [TODO_APP_GENERATION_GUIDANCE] : []),
    ...(isClockAppRequest(request) ? [CLOCK_APP_GENERATION_GUIDANCE] : []),
    ...(isNotesAppRequest(request) ? [NOTES_APP_GENERATION_GUIDANCE] : []),
    ...(isBoardGameRequest(request) ? [BOARD_GAME_GENERATION_GUIDANCE] : []),
    ...(skeleton ? [skeleton] : []),
  ];
};

export const LIGHTWEIGHT_AGENT_SYSTEM_PROMPT = `
You are a small local coding model. Reply once with no explanation.

Output ONLY one labelled source fence with the complete target component file.
Do not return JSON, prose, CSS, a second file, or ReactDOM bootstrap code.
Default-import the co-located CSS Module as styles. The host generates missing CSS rules,
validates the build, and finishes after a successful write.

For interactive UI include React state, handlers, and visible empty/success/error states.
Never leave starter placeholder text. Compute derived values before setState.
`.trim();

export const MIDTIER_AGENT_SYSTEM_PROMPT = `
You are a compact local coding model. Reply once with no explanation.

For source code, return exactly one write_file action using this format:
{"action":"write_file","path":"src/App.jsx","reason":"brief reason"}
\`\`\`jsx
complete file content here
\`\`\`

Do not call list_files, search_workspace, search_semantic, read_file, or replace_file_content.
Do not return CSS, a second file, ReactDOM bootstrap code, or SEARCH/REPLACE blocks.
Default-import the co-located CSS Module as styles. The host generates missing CSS rules,
validates the build, and finishes after a successful write.
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
IMPORTANT: Workspace context is already supplied. Reply with ONLY one labelled source fence
for the target component. No JSON, tool calls, CSS, ReactDOM, or prose.
Include state and handlers when the UI is interactive. The host saves, generates CSS, validates, and finishes.
`.trim();

export const LIGHTWEIGHT_MODULAR_AGENT_SYSTEM_PROMPT = `
You are a small local coding model. For a new UI app, return the complete compact component set in one response.
Return one path-labelled source fence per file, using exactly this format:
\`\`\`jsx path=src/App.jsx
complete file content
\`\`\`
\`\`\`css path=src/App.module.css
complete stylesheet content
\`\`\`

Use project-relative paths only. Include the app entry, up to two focused subcomponents under src/components/, and a co-located .module.css for every component. Export each subcomponent as default, import and render it directly in the app entry, and default-import each co-located module as styles. Write the CSS Modules yourself; do not rely on host-generated styles for the normal path. Keep the complete bundle under about 1700 tokens; use concise code and styles so it fits the local output limit. Include no prose, JSON, tool calls, App.css, inline styles, or ReactDOM bootstrap code. The host validates and stages the files together.
Use the exact app entry path supplied in the user prompt; the example path above shows only the fence format.
`.trim();

export const LIGHTWEIGHT_MODULAR_CONTEXT_READY_INSTRUCTIONS = `
IMPORTANT: The workspace context is supplied. Return only path-labelled source fences in the required file format. Include the App entry, up to two focused subcomponents, and each component's co-located CSS Module. The model must provide the CSS files. Do not inspect files or return JSON, prose, or tool calls.
`.trim();

export const MIDTIER_CONTEXT_READY_INSTRUCTIONS = `
IMPORTANT: Workspace context is already supplied. Return exactly one fenced write_file action
for the target component (JSON metadata line, then one labelled source fence). No exploration
tools, SEARCH/REPLACE, CSS, ReactDOM, or prose. The host validates and finishes after a successful write.
`.trim();

export type ActionLoopSessionPolicy = {
  lightweightModel: boolean;
  midTierModel: boolean;
  modularGeneration: boolean;
  contextReady: boolean;
  midTierAssisted: boolean;
  hostAssistedWrite: boolean;
  useContextReadyPrompt: boolean;
  enforceFulfillment: boolean;
  hostAssistedSession: boolean;
  effectiveAllowedActions: string[];
  agentSystemPrompt: string;
};

export function resolveActionLoopSessionPolicy({
  request = '',
  model,
  priorContext,
  agentRole,
  allowedActions,
  systemPrompt,
}: {
  request?: string;
  model: string;
  priorContext?: string;
  agentRole?: string | null;
  allowedActions: string[];
  systemPrompt: string;
}): ActionLoopSessionPolicy {
  const lightweightModel = isLightweightAgentModel(model);
  const midTierModel = isMidTierAgentModel(model);
  const modularGeneration =
    lightweightModel && !agentRole && isNewAppGenerationRequest(request);
  const contextReady = Boolean(priorContext) && !agentRole;
  const midTierAssisted = midTierModel && !agentRole;
  const hostAssistedWrite =
    (lightweightModel && contextReady && !modularGeneration) || midTierAssisted;
  const useContextReadyPrompt = contextReady || midTierAssisted;
  const enforceFulfillment = lightweightModel || midTierModel;
  const hostAssistedSession = lightweightModel || hostAssistedWrite;
  const effectiveAllowedActions = midTierAssisted
    ? restrictMidTierContextReadyActions(allowedActions)
    : lightweightModel || midTierModel
      ? restrictLowerModelActions(allowedActions)
      : allowedActions;
  const baseSystemPrompt = agentRole
    ? systemPrompt
    : lightweightModel
      ? modularGeneration
        ? LIGHTWEIGHT_MODULAR_AGENT_SYSTEM_PROMPT
        : LIGHTWEIGHT_AGENT_SYSTEM_PROMPT
      : midTierAssisted
        ? MIDTIER_AGENT_SYSTEM_PROMPT
        : systemPrompt;
  const contextReadyInstructions = lightweightModel
    ? modularGeneration
      ? LIGHTWEIGHT_MODULAR_CONTEXT_READY_INSTRUCTIONS
      : LIGHTWEIGHT_CONTEXT_READY_INSTRUCTIONS
    : midTierAssisted
      ? MIDTIER_CONTEXT_READY_INSTRUCTIONS
      : CONTEXT_READY_AGENT_INSTRUCTIONS;
  return {
    lightweightModel,
    midTierModel,
    modularGeneration,
    contextReady,
    midTierAssisted,
    hostAssistedWrite,
    useContextReadyPrompt,
    enforceFulfillment,
    hostAssistedSession,
    effectiveAllowedActions,
    agentSystemPrompt: useContextReadyPrompt
      ? `${contextReadyInstructions}\n\n${baseSystemPrompt}`
      : baseSystemPrompt,
  };
}
