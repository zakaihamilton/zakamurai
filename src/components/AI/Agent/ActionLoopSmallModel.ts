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
Never leave starter placeholder text. Compute derived values before setState.
For grids, lists, and games, update the targeted item or cell by index instead of appending a new item; compute derived status from the next state before calling setters.
For turn-based interactions, do not guard the handler against one hard-coded player or value; allow each active turn to act unless an explicit opponent rule is implemented.
Include an accessible reset, clear, or restart control whenever the interaction has a restartable state.
If a mapped root element itself has onClick (for example a board cell), make that element a <button type="button">. Nested controls inside a list item are already fine.
`.trim();

export const TODO_APP_GENERATION_GUIDANCE = `
For todo and task-list requests, build a polished task planner rather than a starter shell:
- Keep tasks in React state with stable ids and a controlled form. Trim empty submissions, then support add, toggle complete, delete, and clear completed.
- Show a remaining-task count, All/Active/Completed filter tabs, and a helpful empty state. Derive visible tasks and counts from the current state.
- Use semantic CSS Module roles such as app, shell/card, title, subtitle, form/row, control, primaryAction, secondaryAction, dangerAction, list, item, checkbox, and completed.
- Give it a warm paper-and-ink palette with one terracotta accent, clear type hierarchy, a composed list surface, compact rows, responsive layout, and visible hover/focus states.
- MANDATORY todo repair checklist: when tasks start as an empty mapped collection, include a controlled text input or textarea, a visible Add/Create submit control wired to the insertion handler, an explicit empty state, and working add/toggle/delete/clear/filter/count behavior; preserve the CSS Module import as styles and use styles.* for local classes, and do not import App.css or define a JavaScript styles object.
`.trim();

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
- Return the complete component file in the single required source fence. Do not stop after the first half of a render branch.
- Do not finish with a heading-only shell.
`.trim();

export const BOARD_GAME_GENERATION_GUIDANCE = `
For board or turn-based game requests:
- Model the board as an indexed collection and update the targeted cell by index; do not append a new cell.
- Allow each active turn to act. Include reset or restart. Mapped clickable cells must be <button type="button">.
`.trim();

export const generationGuidanceForRequest = (
  request: string,
  { interactiveContract = false }: { interactiveContract?: boolean } = {},
): string[] => [
  ...(interactiveContract ? [INTERACTIVE_GENERATION_GUIDANCE] : []),
  ...(isTodoAppRequest(request) ? [TODO_APP_GENERATION_GUIDANCE] : []),
  ...(isClockAppRequest(request) ? [CLOCK_APP_GENERATION_GUIDANCE] : []),
  ...(isNotesAppRequest(request) ? [NOTES_APP_GENERATION_GUIDANCE] : []),
  ...(isBoardGameRequest(request) ? [BOARD_GAME_GENERATION_GUIDANCE] : []),
];

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

export const MIDTIER_CONTEXT_READY_INSTRUCTIONS = `
IMPORTANT: Workspace context is already supplied. Return exactly one fenced write_file action
for the target component (JSON metadata line, then one labelled source fence). No exploration
tools, SEARCH/REPLACE, CSS, ReactDOM, or prose. The host validates and finishes after a successful write.
`.trim();

export type ActionLoopSessionPolicy = {
  lightweightModel: boolean;
  midTierModel: boolean;
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
  model,
  priorContext,
  agentRole,
  allowedActions,
  systemPrompt,
}: {
  model: string;
  priorContext?: string;
  agentRole?: string | null;
  allowedActions: string[];
  systemPrompt: string;
}): ActionLoopSessionPolicy {
  const lightweightModel = isLightweightAgentModel(model);
  const midTierModel = isMidTierAgentModel(model);
  const contextReady = Boolean(priorContext) && !agentRole;
  const midTierAssisted = midTierModel && !agentRole;
  const hostAssistedWrite = (lightweightModel && contextReady) || midTierAssisted;
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
      ? LIGHTWEIGHT_AGENT_SYSTEM_PROMPT
      : midTierAssisted
        ? MIDTIER_AGENT_SYSTEM_PROMPT
        : systemPrompt;
  const contextReadyInstructions = lightweightModel
    ? LIGHTWEIGHT_CONTEXT_READY_INSTRUCTIONS
    : midTierAssisted
      ? MIDTIER_CONTEXT_READY_INSTRUCTIONS
      : CONTEXT_READY_AGENT_INSTRUCTIONS;
  return {
    lightweightModel,
    midTierModel,
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
