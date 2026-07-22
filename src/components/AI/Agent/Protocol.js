const ACTIONS = new Set([
  'list_files',
  'search_workspace',
  'search_semantic',
  'read_file',
  'write_file',
  'delete_file',
  'validate',
  'finish',
]);

export const ALL_AGENT_ACTIONS = [...ACTIONS];

export function normalizeAgentPath(value) {
  if (typeof value !== 'string') throw new Error('path must be a string');
  const path = value.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!path || path.split('/').includes('..'))
    throw new Error('path must stay inside the workspace');
  return path;
}

export function parseAgentAction(text, { allowedActions = ALL_AGENT_ACTIONS } = {}) {
  if (typeof text !== 'string') throw new Error('Agent response must be text');
  const allowed = new Set(allowedActions?.length ? allowedActions : ALL_AGENT_ACTIONS);
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || text).trim();
  let value;
  try {
    value = JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('Agent response is not valid JSON');
    value = JSON.parse(candidate.slice(start, end + 1));
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
  return value;
}

const ACTION_CATALOG = `
Actions:
{"action":"list_files","query":"optional path fragment"}
{"action":"search_workspace","query":"text or /regex/","glob":"optional extension such as .js"}
{"action":"search_semantic","query":"natural language concept","k":5}
{"action":"read_file","path":"relative/path"}
{"action":"write_file","path":"relative/path","content":"complete new file content","reason":"brief reason"}
{"action":"delete_file","path":"relative/path","reason":"brief reason"}
{"action":"validate"}
{"action":"finish","summary":"brief result"}
`.trim();

export const AGENT_SYSTEM_PROMPT = `
You are a local coding agent operating in a private browser workspace. Work autonomously until the request is complete.
Reply with exactly one JSON action per turn, without markdown or hidden reasoning. JSON may optionally be wrapped in a code fence.

${ACTION_CATALOG}

Use search_workspace for exact symbols/strings. Use search_semantic for concepts ("where is auth handled", "routing setup").
Inspect before editing. You may edit any relevant workspace file. Validate after meaningful changes. Fix validation failures when possible. Never claim success without either validation or a clear explanation.
`.trim();

export const PLANNER_SYSTEM_PROMPT = `
You are the Planner on a local coding agent team in a private browser workspace.
Inspect the workspace and produce a concrete implementation plan. Do not edit files.
Reply with exactly one JSON action per turn, without markdown or hidden reasoning. JSON may optionally be wrapped in a code fence.

Allowed actions only:
{"action":"list_files","query":"optional path fragment"}
{"action":"search_workspace","query":"text or /regex/","glob":"optional extension such as .js"}
{"action":"search_semantic","query":"natural language concept","k":5}
{"action":"read_file","path":"relative/path"}
{"action":"finish","summary":"JSON plan string"}

When finished, call finish with summary set to a compact JSON object:
{"goals":["..."],"files":["path"],"steps":["..."]}
`.trim();

export const CODER_SYSTEM_PROMPT = `
You are the Coder on a local coding agent team in a private browser workspace.
Follow the provided plan and implement the requested changes. Work autonomously until the coding work is complete.
Reply with exactly one JSON action per turn, without markdown or hidden reasoning. JSON may optionally be wrapped in a code fence.

${ACTION_CATALOG}

Inspect before editing. Prefer the files listed in the plan. Validate after meaningful changes. Never claim success without either validation or a clear explanation.
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
{"action":"finish","summary":"review result"}

When finished, call finish with summary set to a compact JSON object:
{"approved":true,"notes":"..."}
or
{"approved":false,"fixes":["..."],"notes":"..."}
If not approved, list concrete fix instructions for the Coder.
`.trim();
