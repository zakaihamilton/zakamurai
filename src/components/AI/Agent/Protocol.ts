import type { AgentAction, AgentActionName } from '@/components/AI/types';

const ACTIONS = new Set<AgentActionName>([
  'list_files',
  'search_workspace',
  'search_semantic',
  'read_file',
  'write_file',
  'replace_file_content',
  'delete_file',
  'validate',
  'list_project_checks',
  'run_project_check',
  'inspect_preview',
  'inspect_console_logs',
  'get_file_symbols',
  'manage_packages',
  'finish',
]);

export const ALL_AGENT_ACTIONS = [...ACTIONS];

export function normalizeAgentPath(value: unknown): string {
  if (typeof value !== 'string') throw new Error('path must be a string');
  const path = value.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!path || path.split('/').includes('..'))
    throw new Error('path must stay inside the workspace');
  return path;
}

type ParseAgentActionOptions = {
  allowedActions?: string[];
  /** When set, fence-only or raw source replies become write_file for this path. */
  defaultWritePath?: string | null;
};

const looksLikeScriptSource = (content: string): boolean =>
  /^(?:import|export|const|let|var|function|class|\/[/*]|<\w)/m.test(content.trim());

/** Pull source from a labelled fence or a raw script-shaped reply. */
export function extractSourcePayload(text: string): string | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const openings = text.match(/```[^\r\n]*\r?\n/g)?.length || 0;
  const closings = text.match(/\r?\n```\s*/g)?.length || 0;
  if (openings > closings) return null;
  const blocks = [...text.matchAll(/```([^\r\n]*)\r?\n([\s\S]*?)(?:\r?\n```|$)/g)].map((match) => ({
    language: match[1].trim().toLowerCase(),
    content: match[2],
    closed: /\r?\n```\s*$/.test(match[0]),
  }));
  const scriptLanguages = new Set([
    '',
    'js',
    'javascript',
    'jsx',
    'ts',
    'typescript',
    'tsx',
    'react',
  ]);
  const fenced = [...blocks]
    .reverse()
    .find(
      (block) =>
        block.closed &&
        scriptLanguages.has(block.language) &&
        looksLikeScriptSource(block.content) &&
        block.content.trim().length > 20,
    );
  if (fenced) return fenced.content.trim();
  const raw = text
    .replace(/^\s*```[^\n]*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();
  if (
    looksLikeScriptSource(raw) &&
    raw.length > 20 &&
    !/["']?action["']?\s*:/.test(raw.slice(0, 80))
  ) {
    return raw;
  }
  return null;
}

const parseJsonAction = (text: string): AgentAction => {
  const candidate = text.trim();
  try {
    return JSON.parse(candidate) as AgentAction;
  } catch {
    // Prefer an action-shaped object over the first `{` in JSX/function bodies.
    const actionStart = candidate.search(/\{[\s\n\r]*["']?action["']?\s*:/);
    const start = actionStart >= 0 ? actionStart : candidate.indexOf('{');
    if (start < 0) throw new Error('Agent response is not valid JSON');

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < candidate.length; index++) {
      const char = candidate[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      if (char === '{') depth++;
      if (char === '}' && --depth === 0)
        return JSON.parse(candidate.slice(start, index + 1)) as AgentAction;
    }
    throw new Error('Agent response is not valid JSON');
  }
};

// Small local models occasionally produce JavaScript-like action metadata (single quotes or
// unquoted property names) next to an otherwise valid source fence. Keep this deliberately
// narrow: it only recovers the action fields the runner accepts, never evaluates model output.
const parseLooseActionMetadata = (text: string): AgentAction | null => {
  const action = text.match(/(?:["']?action["']?)\s*:\s*["']([a-z_]+)["']/i)?.[1];
  if (!action) return null;

  const field = (name: string): string | undefined =>
    text.match(new RegExp(`(?:["']?${name}["']?)\\s*:\\s*["']([^"']*)["']`, 'i'))?.[1];
  const path = field('path');
  const query = field('query');
  const check = field('check');
  const summary = field('summary');
  const reason = field('reason');
  return {
    action,
    ...(path ? { path } : {}),
    ...(query ? { query } : {}),
    ...(check ? { check } : {}),
    ...(summary ? { summary } : {}),
    ...(reason ? { reason } : {}),
  } as AgentAction;
};

const parseFencedWrite = (text: string, metadata?: AgentAction): AgentAction | null => {
  let value = metadata;
  if (!value) {
    try {
      value = parseJsonAction(text);
    } catch {
      return null;
    }
  }
  if (value.action !== 'write_file' || typeof value.path !== 'string') return null;

  // A smaller local model can emit several files in one response despite the one-action
  // protocol. Prefer the source fence whose language matches the requested destination
  // so a trailing CSS fence is never accidentally written to a .jsx file.
  const openings = text.match(/```[^\r\n]*\r?\n/g)?.length || 0;
  const closings = text.match(/\r?\n```\s*/g)?.length || 0;
  if (openings > closings) return null;
  const blocks = [...text.matchAll(/```([^\r\n]*)\r?\n([\s\S]*?)(?:\r?\n```|$)/g)].map((match) => ({
    language: match[1].trim().toLowerCase(),
    content: match[2],
    closed: /\r?\n```\s*$/.test(match[0]),
  }));
  const sourceBlocks = blocks.filter((block) => {
    if (!block.closed) return false;
    try {
      const parsed = JSON.parse(block.content) as { action?: unknown };
      return typeof parsed.action !== 'string';
    } catch {
      return true;
    }
  });
  const extension = value.path.split('.').pop()?.toLowerCase() || '';
  const languagesByExtension: Record<string, string[]> = {
    css: ['css'],
    html: ['html'],
    js: ['js', 'javascript', 'jsx', 'react'],
    jsx: ['jsx', 'javascript', 'js', 'react', 'tsx', 'typescript'],
    ts: ['ts', 'typescript', 'tsx'],
    tsx: ['tsx', 'typescript', 'jsx', 'react', 'ts'],
    json: ['json'],
  };
  const acceptedLanguages = languagesByExtension[extension] || [];
  const isScriptPath = /^(?:js|jsx|ts|tsx)$/.test(extension);
  const isCssPath = extension === 'css';
  const looksLikeScript = (content: string) =>
    /^(?:import|export|const|let|var|function|class|\/[/*]|<\w)/m.test(content.trim());
  const looksLikeCss = (content: string) =>
    /^(?:@|\:root|[.#*\[]|[a-z][\w-]*\s*\{)/m.test(content.trim());
  const matchingSources = sourceBlocks.filter((block) =>
    acceptedLanguages.includes(block.language),
  );
  if (matchingSources.length > 1) {
    throw new Error(
      'A write_file response must contain exactly one source fence for the target file.',
    );
  }
  const matchingSource = matchingSources[0];
  const compatibleSources = sourceBlocks.filter((block) => {
    if (matchingSource) return false;
    if (isScriptPath) return !block.language || looksLikeScript(block.content);
    if (isCssPath)
      return !block.language || looksLikeCss(block.content) || block.language === 'css';
    return !block.language;
  });
  if (compatibleSources.length > 1) {
    throw new Error(
      'A write_file response must contain exactly one source fence for the target file.',
    );
  }
  const source = matchingSource || compatibleSources[0];
  if (source !== undefined) return { ...value, content: source.content };

  // Small models often emit write_file metadata and then raw source without a fence.
  const jsonEnd = (() => {
    const start = text.indexOf('{');
    if (start < 0) return -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index++) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      if (char === '{') depth++;
      if (char === '}' && --depth === 0) return index;
    }
    return -1;
  })();
  if (jsonEnd < 0) return null;
  const trailing = text
    .slice(jsonEnd + 1)
    .replace(/^\s*```[^\n]*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();
  if (
    !trailing ||
    trailing.startsWith('{') ||
    !(isScriptPath ? looksLikeScript(trailing) : isCssPath ? looksLikeCss(trailing) : true)
  ) {
    return null;
  }
  return { ...value, content: trailing };
};

/** Prefer fenced/trailing source over missing, blank, or truncated JSON content fields. */
const attachWriteFileContent = (text: string, value: AgentAction): AgentAction => {
  if (value.action !== 'write_file') return value;
  const recovered = parseFencedWrite(text, value);
  if (!recovered || typeof recovered.content !== 'string' || !recovered.content.trim()) {
    return value;
  }
  const existing = typeof value.content === 'string' ? value.content.trim() : '';
  if (!existing || recovered.content.length >= Math.max(existing.length, 40)) {
    return recovered;
  }
  return value;
};

export function parseAgentAction(
  text: string,
  { allowedActions = ALL_AGENT_ACTIONS, defaultWritePath = null }: ParseAgentActionOptions = {},
): AgentAction {
  if (typeof text !== 'string') throw new Error('Agent response must be text');
  const allowed = new Set(allowedActions?.length ? allowedActions : ALL_AGENT_ACTIONS);
  let value: AgentAction;
  try {
    const fenced = text.match(/^\s*```json\s*([\s\S]*?)\s*```\s*$/i);
    value = parseJsonAction(fenced?.[1] || text);
  } catch (error) {
    const metadata = parseLooseActionMetadata(text);
    const fencedWrite = parseFencedWrite(text, metadata || undefined);
    const sourceOnly =
      !fencedWrite && !metadata && defaultWritePath ? extractSourcePayload(text) : null;
    if (fencedWrite) value = fencedWrite;
    else if (metadata) value = metadata;
    else if (sourceOnly && defaultWritePath) {
      value = { action: 'write_file', path: defaultWritePath, content: sourceOnly };
    } else throw error;
  }
  value = attachWriteFileContent(text, value);
  if (!value || typeof value !== 'object' || !ACTIONS.has(value.action)) {
    throw new Error(`Unknown agent action: ${value?.action || 'missing'}`);
  }
  if (!allowed.has(value.action)) {
    throw new Error(`Action not allowed for this role: ${value.action}`);
  }
  if (
    ['read_file', 'write_file', 'replace_file_content', 'delete_file', 'get_file_symbols'].includes(
      value.action,
    ) &&
    value.path
  ) {
    value.path = normalizeAgentPath(value.path);
  }
  if (value.action === 'write_file' && typeof value.content !== 'string') {
    throw new Error('write_file requires string content');
  }
  if (value.action === 'search_semantic' && typeof value.query !== 'string') {
    throw new Error('search_semantic requires a query string');
  }
  if (value.action === 'run_project_check' && (!value.check || typeof value.check !== 'string')) {
    throw new Error('run_project_check requires a declared check name');
  }
  return value;
}

const ACTION_CATALOG = `
Actions:
{"action":"list_files","query":"optional path or extension fragment (e.g. '.module.css', 'src/components')"}
{"action":"search_workspace","query":"text content or /regex/ to search inside file contents","glob":"optional extension such as .js"}
{"action":"search_semantic","query":"natural language concept","k":5}
{"action":"read_file","path":"relative/path"}
{"action":"write_file","path":"relative/path","content":"complete new file content","reason":"brief reason"}
{"action":"delete_file","path":"relative/path","reason":"brief reason"}
{"action":"validate"}
{"action":"list_project_checks"}
{"action":"run_project_check","check":"test"}
{"action":"inspect_preview"}
{"action":"finish","summary":"brief result"}
`.trim();

const WRITE_FILE_PAYLOAD_FORMAT = `
For write_file actions containing source code, prefer this format to avoid JSON escaping errors:
{"action":"write_file","path":"src/example.jsx","reason":"brief reason"}
\`\`\`jsx
complete file content here
\`\`\`
For a stylesheet, keep both the path and fence language aligned:
{"action":"write_file","path":"src/components/Example.module.css","reason":"style the example"}
\`\`\`css
.example { color: rebeccapurple; }
\`\`\`
The JSON metadata must be on one line and the following single code fence is the content to write. The path extension determines the destination: never write raw CSS to a .jsx or .tsx path. Do not include a content property when using this format. If multiple files are needed, create exactly one file per turn; never append another source fence to an action.`.trim();

export const AGENT_SYSTEM_PROMPT = `
You are a local coding agent operating in a private browser workspace. Work autonomously until the request is complete.
Reply with exactly one action per turn, without hidden reasoning. Use a JSON action unless writing source code, in which case use the fenced write format below.

${ACTION_CATALOG}

${WRITE_FILE_PAYLOAD_FORMAT}

Use list_files to check file existence or list paths by extension (e.g., list_files query: ".module.css"). Use search_workspace to search text inside file contents. Never repeat an identical read-only action after it succeeds; use the result already in the conversation and take the next productive action. Do not repeatedly search_workspace for file extensions. If read_file reports that a file is missing, do not retry it: use write_file to create the intended new file, or choose an existing path from list_files.
When a component will import a new CSS Module, write that complete *.module.css file before writing the importing JSX or TSX file. Do not write a source file that imports a stylesheet which has not been created yet. If a tool queues a source file because its CSS Module is missing, immediately write the named stylesheet with the complete visual rules; do not inspect the workspace again.
Inspect before editing only when workspace context has not already been supplied. When the request says that workspace context was already supplied, treat the workspace as inspected and do not call list_files, search_workspace, search_semantic, or read_file again; use the supplied context and implement the request immediately. You may edit any relevant workspace file. Validate after meaningful changes. Always run validate before calling finish when edits have been made. Fix validation failures when possible. Never claim success without either validation or a clear explanation.

UI craft bar: When creating an interface, make deliberate visual decisions rather than falling back to a generic white card, system font, blue primary button, and thin gray borders. Establish a cohesive visual direction, clear type hierarchy, a restrained palette, layered surfaces or texture, intentional spacing, meaningful interaction states, visible keyboard focus, and a responsive small-screen layout. Use CSS custom properties for the page's design tokens. Do not use external assets or icon libraries unless they already exist in the workspace.
If the user does not specify a theme, choose a polished neutral surface with dark text and one intentional accent such as indigo, emerald, terracotta, or violet.
For list and task-management applications (such as Todo apps):
- Container: Center the app in a polished card container (max-width: 32rem to 42rem) with subtle shadow, clear header, item counter, and filter tabs (All, Active, Completed).
- Form layout: Place input and primary submit button in a single horizontal flex row (display: flex; gap: 0.75rem). The input field must take flex: 1 with explicit padding and focus styles; the submit button must be a high-contrast primary CTA.
- List items: Render items as compact horizontal flex rows (display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.75rem 1rem), containing a left flex group (styled checkbox + text label) and a right group (compact delete button). Never render todo items as giant stacked cards or place checkboxes inside giant square aspect-ratio boxes.
- Completed state: Strike through completed text with reduced opacity (text-decoration: line-through; opacity: 0.6).

When an event handler derives a result from a state update, compute the next value first and use
that value for validation, status, or side effects before calling the state setter. React state
updates are asynchronous, so reading the old state after setState can produce incorrect UI.
Keep callbacks that access hook state or setters inside the component, and mentally exercise every
primary control plus reset, submit, empty, success, and error paths before finishing.

Preview isolation and contrast contract: The preview is an isolated, theme-neutral document; never rely on colors inherited from the host shell or browser defaults. In the root stylesheet, explicitly reset :global(:root), :global(body), and :global(#root) (margin, padding, min-height, background, and color), then set the app surface and foreground colors locally. Define tokens such as --color-bg, --color-surface, --color-text, --color-muted, --color-primary, and --color-on-primary, and apply them to every heading, paragraph, input, button, placeholder, and status message. Keep normal text at WCAG AA contrast (at least 4.5:1; 3:1 for large text and controls). A dark surface must use light text; a light surface must use dark text—never combine a dark background with default black text. When the request does not specify a theme, prefer a polished light neutral surface with dark text and one accent. Set explicit input/button backgrounds, borders, and :focus-visible styles so the UI remains readable regardless of the preview host theme.

For application requests, update the existing app entry (normally src/App.jsx or src/App.tsx) and avoid repeatedly rewriting already-staged files unless a tool or validation result identifies a specific defect. Do not create index.html for a standard Vite app: the compiler scaffolds it automatically.

Architecture Rules:
- Decompose UI applications into modular sub-components inside src/components/.
- Co-locate a CSS Module (*.module.css) with each component (e.g., src/components/Header.jsx and src/components/Header.module.css).
- Default-import CSS Modules and use their exported class map for module-local classes (for example, className={styles.container}). Never side-effect import *.module.css files or use their module-local classes as literal className strings.
- Never put CSS in JSX/TSX: do not use style props, <style> tags, or CSS-in-JS. Put visual rules in the component's CSS Module.
- Avoid putting all state, logic, and JSX inside a single monolithic App.jsx file.
`.trim();

export const PLANNER_SYSTEM_PROMPT = `
You are the Planner on a local coding agent team in a private browser workspace.
Inspect the workspace and produce a concrete implementation plan. Do not edit files.
Reply with exactly one action per turn, without hidden reasoning. Use a JSON action unless writing source code, in which case use the fenced write format below.

Allowed actions only:
{"action":"list_files","query":"optional path fragment"}
{"action":"search_workspace","query":"text or /regex/","glob":"optional extension such as .js"}
{"action":"search_semantic","query":"natural language concept","k":5}
{"action":"read_file","path":"relative/path"}
{"action":"finish","summary":"JSON plan string"}

Architecture requirement: Break down UI into sub-components in src/components/, listing each sub-component file and its matching CSS Module (*.module.css) in the files array.

When finished, call finish with summary set to a compact JSON object:
{"goals":["..."],"files":["src/components/SubComp.jsx","src/components/SubComp.module.css"],"steps":["..."]}

When the user request or prior context says "Visual UI mode", also include a visualBrief object. Keep every field concise and concrete:
{"visualBrief":{"pageHierarchy":["..."],"components":["..."],"palette":["..."],"typography":["..."],"tokens":["spacing / radius / shadow values"],"responsive":["..."],"interactions":["..."],"accessibility":["..."]}}
`.trim();

export const CODER_SYSTEM_PROMPT = `
You are the Coder on a local coding agent team in a private browser workspace.
Follow the provided plan and implement the requested changes. Work autonomously until the coding work is complete.
Reply with exactly one action per turn, without hidden reasoning. Use a JSON action unless writing source code, in which case use the fenced write format below.

${ACTION_CATALOG}

${WRITE_FILE_PAYLOAD_FORMAT}

Inspect before editing only when the plan does not already include the needed workspace context. When prior context supplies the relevant files and contents, treat the workspace as inspected and implement the plan immediately; do not repeat list_files, search_workspace, search_semantic, or read_file. Prefer the files listed in the plan. Validate after meaningful changes. Always run validate before calling finish when edits have been made. Never claim success without either validation or a clear explanation.

Architecture Rules:
1. Break down UI into reusable sub-components in src/components/.
2. Style each component using co-located CSS Modules (*.module.css) imported inside the component (e.g., import styles from './SubComp.module.css').
3. Apply module-local CSS classes through the imported class map (for example, styles.container or styles["task-item"]), never literal className strings.
4. Never put CSS in JSX/TSX: do not use style props, <style> tags, or CSS-in-JS. Put visual rules in the component's CSS Module.
5. Keep App.jsx clean, using it primarily to compose sub-components.

Visual UI mode (only when supplied in prior context): Implement the approved visual brief rather than inventing an unrelated style. Use semantic landmarks, CSS custom properties for the declared design tokens, responsive layout rules, sufficient color contrast, and visible keyboard focus states. Keep each meaningful visual section in a reusable component with a co-located CSS Module.

UI craft bar: Avoid generic default styling such as a white card, system font, blue button, and thin gray borders. Make the brief's visual direction tangible through hierarchy, typography, palette, surface treatment, spacing, and purposeful interaction states. Do not add external assets or icon libraries unless they already exist in the workspace.

Preview isolation and contrast contract: Treat the preview as a theme-neutral document. In the root stylesheet, explicitly reset :global(:root), :global(body), and :global(#root), including margin, padding, min-height, background, and color; do not inherit the host shell's dark theme. Define color tokens and use them for all text, surfaces, form controls, placeholders, and focus states. Keep normal text at WCAG AA contrast (4.5:1; 3:1 for large text and controls). Pair dark surfaces with light text and light surfaces with dark text. If no theme is requested, use a polished light neutral surface with dark text and one accent.
`.trim();

export const REVIEWER_SYSTEM_PROMPT = `
You are the Reviewer on a local coding agent team in a private browser workspace.
Review the staged changes against the plan and request. You may inspect files and run validate. Do not edit or delete files.
Reply with exactly one JSON action per turn, without markdown or hidden reasoning. JSON may optionally be wrapped in a code fence.

Allowed actions only:
{"action":"list_files","query":"optional path fragment"}
{"action":"search_workspace","query":"text or /regex/","glob":"optional extension such as .js"}
{"action":"search_semantic","query":"natural language concept","k":5}
{"action":"read_file","path":"relative/path"}
{"action":"validate"}
{"action":"inspect_preview"}
{"action":"finish","summary":"review result"}

Architecture Quality Gate:
1. Reject proposals (approved: false) if application logic/UI is crammed into a single monolithic App.jsx/App.tsx (>150 lines or multiple visual components without sub-components).
2. Reject proposals (approved: false) if newly created React components lack matching imported CSS Modules (*.module.css).

When finished, call finish with summary set to a compact JSON object:
{"approved":true,"notes":"..."}
or
{"approved":false,"fixes":["..."],"notes":"..."}
If not approved, list concrete fix instructions for the Coder.

Visual UI mode (only when supplied in prior context): call inspect_preview before finishing. Reject the change if preview evidence reports runtime errors, lacks the requested landmarks or named interactive elements, or does not satisfy the supplied visual brief's responsive and accessibility requirements. Do not claim to judge screenshot aesthetics; use the structured preview evidence instead.
`.trim();

export const CUSTOM_SYSTEM_PROMPT = `
You are a specialist on a local coding agent team in a private browser workspace.
Complete your assigned specialty, then finish with a concise summary for teammates.
Reply with exactly one JSON action per turn, without markdown or hidden reasoning. JSON may optionally be wrapped in a code fence.

${ACTION_CATALOG}

${WRITE_FILE_PAYLOAD_FORMAT}

Inspect before editing when your role requires changes. Never claim success without either validation or a clear explanation.
`.trim();
