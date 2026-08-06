import type {
  ManagerIntent,
  ManagerPlan,
  ManagerStep,
  ManagerToolName,
} from '@/components/AI/types';

const CHANGE_WORDS =
  /\b(add|build|change|create|delete|design|edit|fix|implement|improve|make|modify|refactor|remove|rename|replace|style|update|write)\b/i;
const EXPLICIT_EDIT_WORDS =
  /\b(add|change|create|delete|design|edit|fix|implement|improve|make|modify|refactor|remove|rename|replace|style|update|write)\b/i;
const CHECK_WORDS = /\b(build|compile|run|test|lint|check|verify|diagnos|error|failure)\b/i;
const TOOL_ONLY_CHECK =
  /\b(?:build|compile)\s+(?:the\s+)?(?:project|app)|\b(?:run|execute)\s+(?:the\s+)?(?:tests?|checks?|lint)|\b(?:test|lint|verify)\s+(?:the\s+)?project\b/i;
const PREVIEW_WORDS = /\b(preview|render|inspect the app|browser output|runtime)\b/i;
const UI_WORDS =
  /\b(app|application|button|card|component|dashboard|form|game|interface|input|layout|list|menu|modal|page|screen|table|todo|ui|widget|website|visual|style|design|responsive|interactive)\b/i;
const SEARCH_WORDS =
  /\b(search|find|grep|where|which files|list(?: the)? files|show files|what files)\b/i;
const READ_WORDS = /\b(?:read|open)\b/i;
const CHECK_LIST_WORDS = /\b(?:which|what|list|show)\b.*\b(?:project\s+)?checks?\b/i;
const EXPLAIN_WORDS = /\b(explain|summari[sz]e|how does|why does|what does|describe)\b/i;
const SEMANTIC_DIAGNOSTIC_WORDS =
  /\b(?:why|diagnos(?:e|is|tic)?|what caused|root cause|help me understand)\b/i;

const tool = (
  name: ManagerToolName,
  reason: string,
  input?: Record<string, unknown>,
): ManagerStep =>
  ({ kind: 'tool', tool: name, reason, ...(input ? { input } : {}) }) as ManagerStep;

/** UI edits need a preview pass so build-success is not mistaken for visual completion. */
export function isLikelyUiRequest(request: string): boolean {
  return CHANGE_WORDS.test(request) && UI_WORDS.test(request);
}

export function classifyManagerIntent(request: string): ManagerIntent | null {
  const text = request.trim();
  if (!text) return null;
  if (EXPLAIN_WORDS.test(text) || SEMANTIC_DIAGNOSTIC_WORDS.test(text)) return 'explanation';
  if (CHECK_LIST_WORDS.test(text)) return 'project-check';
  if (
    (TOOL_ONLY_CHECK.test(text) || isLikelyProjectCheck(text)) &&
    !EXPLICIT_EDIT_WORDS.test(text)
  ) {
    return 'project-check';
  }
  if (CHANGE_WORDS.test(text)) {
    if (CHECK_WORDS.test(text) || PREVIEW_WORDS.test(text)) return 'mixed';
    return 'edit';
  }
  if (PREVIEW_WORDS.test(text)) return 'preview-inspection';
  if (SEARCH_WORDS.test(text) || READ_WORDS.test(text)) return 'workspace-query';
  return null;
}

export function createManagerPlan(request: string): ManagerPlan {
  const intent = classifyManagerIntent(request);
  if (!intent) {
    return {
      intent: 'explanation',
      steps: [
        { kind: 'model', task: 'answer', reason: 'The request needs semantic interpretation.' },
      ],
      modelRequired: true,
      confidence: 'fallback',
    };
  }

  if (intent === 'project-check') {
    return {
      intent,
      steps: [
        tool('list_project_checks', 'Discover safe project checks declared by the workspace.'),
        tool('run_project_check', 'Run the requested eligible check when one is identified.'),
      ],
      modelRequired: false,
      confidence: 'high',
    };
  }
  if (intent === 'preview-inspection') {
    return {
      intent,
      steps: [tool('inspect_preview', 'Inspect deterministic preview and runtime evidence.')],
      modelRequired: false,
      confidence: 'high',
    };
  }
  if (intent === 'workspace-query') {
    return {
      intent,
      steps: [tool('list_files', 'Start with the workspace inventory.')],
      modelRequired: false,
      confidence: 'high',
    };
  }
  if (intent === 'explanation') {
    return {
      intent,
      steps: [
        tool(
          'search_workspace',
          'Gather matching source context before asking the model to explain it.',
        ),
        { kind: 'model', task: 'answer', reason: 'The explanation requires semantic reasoning.' },
      ],
      modelRequired: true,
      confidence: 'high',
    };
  }
  if (intent === 'mixed') {
    const steps: ManagerStep[] = [
      tool('read_file', 'Read the relevant current source before editing.'),
      {
        kind: 'model',
        task: 'generate-changes',
        reason: 'Generate the requested changes from current source.',
      },
      tool('validate', 'Validate generated changes deterministically.'),
    ];
    if (PREVIEW_WORDS.test(request) || isLikelyUiRequest(request)) {
      steps.push(
        tool('inspect_preview', 'Inspect the updated workspace preview after validation.'),
      );
    }
    return {
      intent,
      steps,
      modelRequired: true,
      confidence: 'high',
    };
  }
  const steps: ManagerStep[] = [
    tool('read_file', 'Read the active or most relevant source before editing.'),
    { kind: 'model', task: 'generate-changes', reason: 'Generate the requested code changes.' },
    tool('validate', 'Validate generated changes deterministically.'),
  ];
  if (isLikelyUiRequest(request)) {
    steps.push(tool('inspect_preview', 'Inspect the updated workspace preview after validation.'));
  }
  return {
    intent: 'edit',
    steps,
    modelRequired: true,
    confidence: 'high',
  };
}

export function isLikelyProjectCheck(request: string): boolean {
  return (
    /\b(?:run|execute|perform)\b/i.test(request) &&
    /\b(?:build|compile|tests?|checks?|lint|verify)\b/i.test(request)
  );
}

export function isLikelyFileRequest(request: string): boolean {
  return /\b(?:file|files|src\/|\.tsx?|\.jsx?|\.css|package\.json)\b/i.test(request);
}
