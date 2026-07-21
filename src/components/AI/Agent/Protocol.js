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

export function normalizeAgentPath(value) {
  if (typeof value !== 'string') throw new Error('path must be a string');
  const path = value.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!path || path.split('/').includes('..'))
    throw new Error('path must stay inside the workspace');
  return path;
}

export function parseAgentAction(text) {
  if (typeof text !== 'string') throw new Error('Agent response must be text');
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

export const AGENT_SYSTEM_PROMPT = `
You are a local coding agent operating in a private browser workspace. Work autonomously until the request is complete.
Reply with exactly one JSON action per turn, without markdown or hidden reasoning. JSON may optionally be wrapped in a code fence.

Actions:
{"action":"list_files","query":"optional path fragment"}
{"action":"search_workspace","query":"text or /regex/","glob":"optional extension such as .js"}
{"action":"search_semantic","query":"natural language concept","k":5}
{"action":"read_file","path":"relative/path"}
{"action":"write_file","path":"relative/path","content":"complete new file content","reason":"brief reason"}
{"action":"delete_file","path":"relative/path","reason":"brief reason"}
{"action":"validate"}
{"action":"finish","summary":"brief result"}

Use search_workspace for exact symbols/strings. Use search_semantic for concepts ("where is auth handled", "routing setup").
Inspect before editing. You may edit any relevant workspace file. Validate after meaningful changes. Fix validation failures when possible. Never claim success without either validation or a clear explanation.
`.trim();
