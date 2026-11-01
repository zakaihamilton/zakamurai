import type { AgentChange, ManagerToolName, ModelResult, SemanticSearchResult } from '../types';
import type { createManagerPlan } from './ManagerRouter';
import { type ManagerToolResult, formatContextResults } from './ManagerTools';
import { extractFileSymbols } from './SymbolInspector';

const MAX_INITIAL_CONTEXT_FILES = 6;
const MAX_CONTEXT_CHARS = 28000;
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

export const contextText = (
  results: ManagerToolResult[],
  maxChars: number = MAX_CONTEXT_CHARS,
): string => formatContextResults(results).slice(0, Math.max(500, maxChars));

export const selectInitialContextFiles = (
  paths: string[],
  activeFile?: string | null,
  maxFiles: number = MAX_INITIAL_CONTEXT_FILES,
): string[] => {
  const uniquePaths = [...new Set(paths)];
  const limit = Math.max(1, Math.min(maxFiles, MAX_INITIAL_CONTEXT_FILES));
  const prioritized = [
    activeFile || '',
    ...uniquePaths.filter((path) => STARTER_FILE_NAMES.has(path)),
    ...uniquePaths.filter(
      (path) => SOURCE_FILE_PATTERN.test(path) && !STARTER_FILE_NAMES.has(path),
    ),
  ];
  return [...new Set(prioritized.filter(Boolean))].slice(0, limit);
};

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'make',
  'update',
  'change',
  'fix',
  'add',
  'create',
  'file',
  'files',
  'code',
  'please',
  'app',
  'component',
]);

/**
 * Reciprocal Rank Fusion (RRF) combining lexical symbol/token matching and
 * semantic RAG similarity to rank candidate workspace files for initial context.
 */
export function rankHybridContextFiles({
  request,
  files,
  semanticResults = [],
  activeFile = null,
  maxFiles = MAX_INITIAL_CONTEXT_FILES,
}: {
  request: string;
  files: Record<string, string>;
  semanticResults?: SemanticSearchResult[];
  activeFile?: string | null;
  maxFiles?: number;
}): string[] {
  const paths = Object.keys(files).filter((path) => SOURCE_FILE_PATTERN.test(path));
  if (paths.length === 0) return [];
  const limit = Math.max(1, Math.min(maxFiles, MAX_INITIAL_CONTEXT_FILES));

  const queryTerms = [
    ...new Set(
      request
        .toLowerCase()
        .split(/[^a-z0-9_]+/)
        .filter((term) => term.length >= 3 && !STOP_WORDS.has(term)),
    ),
  ];

  // 1. Lexical / Symbol score per file
  const lexicalScored = paths
    .map((path) => {
      const content = String(files[path] || '');
      const lowerPath = path.toLowerCase();
      const lowerContent = content.toLowerCase();
      const outline = extractFileSymbols(content, path);
      const symbolNames = outline.symbols.map((s) => s.name.toLowerCase());
      let score = 0;
      for (const term of queryTerms) {
        if (lowerPath.includes(term)) score += 4;
        if (symbolNames.some((sym) => sym.includes(term))) score += 3;
        if (lowerContent.includes(term)) score += 1;
      }
      return { path, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  // 2. Semantic rank per file
  const semanticPaths: string[] = [];
  for (const hit of semanticResults) {
    if (
      hit.filePath &&
      Object.hasOwn(files, hit.filePath) &&
      !semanticPaths.includes(hit.filePath)
    ) {
      semanticPaths.push(hit.filePath);
    }
    if (Array.isArray(hit.linkedCss)) {
      for (const css of hit.linkedCss) {
        if (
          css.filePath &&
          Object.hasOwn(files, css.filePath) &&
          !semanticPaths.includes(css.filePath)
        ) {
          semanticPaths.push(css.filePath);
        }
      }
    }
  }

  // 3. Reciprocal Rank Fusion (RRF k=60)
  const rrfScores = new Map<string, number>();
  const K = 60;
  lexicalScored.forEach((entry, idx) => {
    rrfScores.set(entry.path, (rrfScores.get(entry.path) || 0) + 1 / (K + idx + 1));
  });
  semanticPaths.forEach((path, idx) => {
    rrfScores.set(path, (rrfScores.get(path) || 0) + 1.25 / (K + idx + 1));
  });

  const rrfRanked = [...rrfScores.entries()].sort((a, b) => b[1] - a[1]).map(([path]) => path);

  const baseline = selectInitialContextFiles(Object.keys(files), activeFile, limit);
  const combined = [
    ...(activeFile && Object.hasOwn(files, activeFile) ? [activeFile] : []),
    ...rrfRanked,
    ...baseline,
  ];
  return [...new Set(combined)].slice(0, limit);
}

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
