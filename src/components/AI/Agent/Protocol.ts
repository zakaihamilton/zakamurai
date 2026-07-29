import type { AgentAction, AgentActionName } from '@/components/AI/types';

const ACTIONS = new Set<AgentActionName>([
  'list_files',
  'search_workspace',
  'search_semantic',
  'read_file',
  'write_file',
  'delete_file',
  'validate',
  'list_project_checks',
  'run_project_check',
  'inspect_preview',
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
};

const parseJsonAction = (text: string): AgentAction => {
  const candidate = text.trim();
  try {
    return JSON.parse(candidate) as AgentAction;
  } catch {
    const start = candidate.indexOf('{');
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

  // Models sometimes wrap the action JSON, source, or both in code fences. Use the
  // final fence because it is the source payload when a JSON metadata fence precedes it.
  // An unfinished final fence is also accepted so a truncated but otherwise useful write
  // can be staged and validated instead of being discarded as a protocol failure.
  const blocks = [...text.matchAll(/```[^\r\n]*\r?\n([\s\S]*?)(?:\r?\n```|$)/g)].map(
    (match) => match[1],
  );
  const source = blocks.reverse().find((block) => {
    try {
      const parsed = JSON.parse(block) as { action?: unknown };
      return typeof parsed.action !== 'string';
    } catch {
      return true;
    }
  });
  if (source === undefined) return null;

  return { ...value, content: source };
};

export function parseAgentAction(
  text: string,
  { allowedActions = ALL_AGENT_ACTIONS }: ParseAgentActionOptions = {},
): AgentAction {
  if (typeof text !== 'string') throw new Error('Agent response must be text');
  const allowed = new Set(allowedActions?.length ? allowedActions : ALL_AGENT_ACTIONS);
  let value: AgentAction;
  try {
    const fenced = text.match(/^\s*```json\s*([\s\S]*?)\s*```\s*$/i);
    value = parseJsonAction(fenced?.[1] || text);
  } catch (error) {
    const fencedWrite = parseFencedWrite(text);
    if (!fencedWrite) throw error;
    value = fencedWrite;
  }
  if (value.action === 'write_file' && typeof value.content !== 'string') {
    const fencedWrite = parseFencedWrite(text, value);
    if (fencedWrite) value = fencedWrite;
  }
  if (!value || typeof value !== 'object' || !ACTIONS.has(value.action)) {
    throw new Error(`Unknown agent action: ${value?.action || 'missing'}`);
  }
  if (!allowed.has(value.action)) {
    throw new Error(`Action not allowed for this role: ${value.action}`);
  }
  if (['read_file', 'write_file', 'delete_file'].includes(value.action)) {
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
The JSON metadata must be on one line and the following single code fence is the content to write. Do not include a content property when using this format.`.trim();

export const AGENT_SYSTEM_PROMPT = `
You are a local coding agent operating in a private browser workspace. Work autonomously until the request is complete.
Reply with exactly one action per turn, without hidden reasoning. Use a JSON action unless writing source code, in which case use the fenced write format below.

${ACTION_CATALOG}

${WRITE_FILE_PAYLOAD_FORMAT}

Use list_files to check file existence or list paths by extension (e.g., list_files query: ".module.css"). Use search_workspace to search text inside file contents. Do not repeatedly search_workspace for file extensions. If read_file reports that a file is missing, do not retry it: use write_file to create the intended new file, or choose an existing path from list_files.
Inspect before editing. You may edit any relevant workspace file. Validate after meaningful changes. Always run validate before calling finish when edits have been made. Fix validation failures when possible. Never claim success without either validation or a clear explanation.

Architecture Rules:
- Decompose UI applications into modular sub-components inside src/components/.
- Co-locate a CSS Module (*.module.css) with each component (e.g., src/components/Header.jsx and src/components/Header.module.css).
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

Inspect before editing. Prefer the files listed in the plan. Validate after meaningful changes. Always run validate before calling finish when edits have been made. Never claim success without either validation or a clear explanation.

Architecture Rules:
1. Break down UI into reusable sub-components in src/components/.
2. Style each component using co-located CSS Modules (*.module.css) imported inside the component (e.g., import styles from './SubComp.module.css').
3. Never put CSS in JSX/TSX: do not use style props, <style> tags, or CSS-in-JS. Put visual rules in the component's CSS Module.
4. Keep App.jsx clean, using it primarily to compose sub-components.

Visual UI mode (only when supplied in prior context): Implement the approved visual brief rather than inventing an unrelated style. Use semantic landmarks, CSS custom properties for the declared design tokens, responsive layout rules, sufficient color contrast, and visible keyboard focus states. Keep each meaningful visual section in a reusable component with a co-located CSS Module.
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
