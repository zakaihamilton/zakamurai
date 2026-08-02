import type { AgentChange, ContextRequest, ModelResult } from '@/components/AI/types';

const ALLOWED_CONTEXT_TOOLS = new Set<ContextRequest['tool']>([
  'list_files',
  'search_workspace',
  'search_semantic',
  'read_file',
]);

export const MANAGER_SYSTEM_PROMPT = `
You are the reasoning and coding part of a browser-based AI Manager.
The manager has already executed local workspace tools and supplied their results. Do not invent file contents.
Return exactly one JSON object and no markdown.

For an explanation or answer:
{"kind":"answer","summary":"concise answer grounded in the supplied context"}

If more source context is required:
{"kind":"request-context","requests":[{"tool":"read_file","input":{"path":"src/App.jsx"}}]}

For code changes:
{"kind":"changes","summary":"what changed","changes":[{"path":"src/App.jsx","content":"complete file content"}]}

For deletions, use an explicit delete proposal:
{"kind":"changes","summary":"what changed","changes":[{"path":"src/old-file.js","delete":true}]}

Use only project-relative paths. Never use absolute paths or .. traversal. Return complete file contents for every changed file.
Do not return tool actions, write_file actions, role names, plans, or prose outside the JSON object.
`.trim();

const firstJsonObject = (text: string): unknown => {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced?.[1] || text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    if (start < 0) throw new Error('Model response did not contain a JSON object.');
    let depth = 0;
    let string = false;
    let escaped = false;
    for (let index = start; index < candidate.length; index++) {
      const char = candidate[index];
      if (string) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') string = false;
        continue;
      }
      if (char === '"') string = true;
      if (char === '{') depth += 1;
      if (char === '}' && --depth === 0) return JSON.parse(candidate.slice(start, index + 1));
    }
    throw new Error('Model response did not contain a complete JSON object.');
  }
};

const safeContextRequests = (value: unknown): ContextRequest[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => Boolean(item) && typeof item === 'object')
    .map((item) => item as { tool?: unknown; input?: unknown })
    .map((item) => ({
      tool: item.tool,
      input: item.input,
    }))
    .filter(
      (item) =>
        typeof item.tool === 'string' &&
        ALLOWED_CONTEXT_TOOLS.has(item.tool as ContextRequest['tool']),
    )
    .map((item) => item as unknown as ContextRequest)
    .slice(0, 4)
    .map((item) => {
      const input = item.input && typeof item.input === 'object' ? item.input : undefined;
      if (
        item.tool === 'read_file' &&
        typeof (input as Record<string, unknown> | undefined)?.path !== 'string'
      )
        return null;
      if (
        (item.tool === 'search_workspace' || item.tool === 'search_semantic') &&
        typeof (input as Record<string, unknown> | undefined)?.query !== 'string'
      )
        return null;
      return {
        tool: item.tool,
        ...(input ? { input: input as Record<string, unknown> } : {}),
      };
    })
    .filter((item): item is ContextRequest => Boolean(item));
};

const normalizeChanges = (value: unknown): AgentChange[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (change): change is Record<string, unknown> => Boolean(change) && typeof change === 'object',
    )
    .map((change) => ({
      path: typeof change.path === 'string' ? change.path : '',
      ...(typeof change.before === 'string' ? { before: change.before } : {}),
      ...(typeof change.after === 'string' ? { after: change.after } : {}),
      ...(typeof change.content === 'string' ? { content: change.content } : {}),
      ...(change.delete === true ? { delete: true } : {}),
    }))
    .filter(
      (change) =>
        Boolean(change.path) &&
        (typeof change.after === 'string' ||
          typeof change.content === 'string' ||
          change.delete === true),
    );
};

export function parseModelResult(text: string): ModelResult {
  const value = firstJsonObject(text) as {
    kind?: unknown;
    summary?: unknown;
    requests?: unknown;
    changes?: unknown;
  };
  if (value.kind === 'answer') {
    return { kind: 'answer', summary: typeof value.summary === 'string' ? value.summary : '' };
  }
  if (value.kind === 'request-context') {
    return { kind: 'request-context', requests: safeContextRequests(value.requests) };
  }
  if (value.kind === 'changes') {
    return {
      kind: 'changes',
      summary: typeof value.summary === 'string' ? value.summary : '',
      changes: normalizeChanges(value.changes),
    };
  }
  throw new Error(`Unknown model result kind: ${String(value.kind || 'missing')}`);
}

export function buildManagerModelPrompt(
  request: string,
  context: string,
  task: 'answer' | 'generate-changes' | 'repair-changes',
  diagnostics = '',
): string {
  const taskInstruction =
    task === 'answer'
      ? 'Answer the user using the supplied workspace evidence.'
      : task === 'repair-changes'
        ? 'Repair the proposed changes using the validation diagnostics, then return complete replacement file contents.'
        : 'Implement the user request and return complete replacement contents for every changed file.';
  return [
    `User request:\n${request}`,
    `Task:\n${taskInstruction}`,
    context ? `Workspace evidence:\n${context}` : 'Workspace evidence: none was available.',
    diagnostics ? `Validation diagnostics:\n${diagnostics}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
