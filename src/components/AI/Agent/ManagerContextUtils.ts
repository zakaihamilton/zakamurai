import type { AgentChange, ManagerToolName, ModelResult } from '../types';
import type { createManagerPlan } from './ManagerRouter';
import { type ManagerToolResult, formatContextResults } from './ManagerTools';

const MAX_INITIAL_CONTEXT_FILES = 6;
const STARTER_FILE_NAMES = new Set([
  'package.json',
  'src/App.js',
  'src/App.jsx',
  'src/App.ts',
  'src/App.tsx',
  'src/main.js',
  'src/main.jsx',
  'src/main.ts',
  'src/main.tsx',
  'src/index.js',
  'src/index.jsx',
  'src/index.ts',
  'src/index.tsx',
]);
const SOURCE_FILE_PATTERN = /\.(?:css|html|js|jsx|json|md|ts|tsx)$/i;

export const summarizeToolResult = (tool: ManagerToolName, value: unknown): string => {
  if (tool === 'list_files' && Array.isArray(value))
    return `Found ${value.length} workspace file(s).\n${value.join('\n')}`;
  if (tool === 'validate' && value && typeof value === 'object') {
    const result = value as { status?: string; diagnostics?: string; output?: string };
    return `${result.status || 'unknown'}${result.diagnostics ? `\n${result.diagnostics}` : result.output ? `\n${result.output}` : ''}`;
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
};

export const extractQuery = (request: string): string => {
  const listDirectory = request.match(
    /\b(?:list|show)\b.*\bfiles?\b.*\b(?:in|under|within)\s+(?:the\s+)?[`'“”`]?((?:[\w.-]+\/)*[\w.-]+)[`'“”`]?\s*$/i,
  )?.[1];
  if (listDirectory && !/^(?:workspace|project|repository|repo)$/i.test(listDirectory)) {
    return `${listDirectory.replace(/\/+$/, '')}/`;
  }
  const quoted = request.match(/["'“”`]([^"'“”`]+)["'“”`]/)?.[1];
  if (quoted) return quoted;
  return request
    .replace(/\b(?:please|search|find|grep|show|list|files?|for|in|the|workspace|src)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const planIncludesTool = (
  plan: ReturnType<typeof createManagerPlan>,
  tool: ManagerToolName,
) => plan.steps.some((step) => step.kind === 'tool' && step.tool === tool);

export const extractPath = (request: string, activeFile?: string | null): string | null => {
  const quoted = request.match(/["'“”`]([^"'“”`]+)["'“”`]/)?.[1];
  const path = request.match(
    /(?:^|\s)((?:[\w.-]+\/)*[\w.-]+\.(?:json|jsx?|tsx?|css|html|md|txt)\b)/i,
  )?.[1];
  if (quoted && !quoted.includes('/') && !/\.[a-z0-9]+$/i.test(quoted)) return activeFile || null;
  return path || activeFile || null;
};

export const contextText = (results: ManagerToolResult[]): string =>
  formatContextResults(results).slice(0, 28000);

export const selectInitialContextFiles = (
  paths: string[],
  activeFile?: string | null,
): string[] => {
  const uniquePaths = [...new Set(paths)];
  const prioritized = [
    activeFile || '',
    ...uniquePaths.filter((path) => STARTER_FILE_NAMES.has(path)),
    ...uniquePaths.filter((path) => SOURCE_FILE_PATTERN.test(path)),
  ];
  return [...new Set(prioritized.filter(Boolean))].slice(0, MAX_INITIAL_CONTEXT_FILES);
};

export const normalizeModelChanges = (
  result: ModelResult,
  files: Record<string, string>,
): AgentChange[] => {
  if (result.kind !== 'changes') return [];
  return result.changes.map((change) => {
    const path = change.path || change.filePath || '';
    const content = typeof change.after === 'string' ? change.after : change.content;
    return {
      ...change,
      path,
      before: change.before ?? files[path],
      ...(content !== undefined ? { after: content } : {}),
    };
  });
};
