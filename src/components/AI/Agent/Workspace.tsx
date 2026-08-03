import type {
  AgentChange,
  FileMap,
  SemanticSearchResult,
  WorkspaceIndex,
} from '@/components/AI/types';
import { normalizeAgentPath } from './Protocol';

const MAX_FILE_CHARS = 20000;
const MAX_RESULT_CHARS = 12000;

const escapeRegExp = (value: string): string => value.replace(/[.+^${}()|[\]\\]/g, '\\$&');

const matchesPathQuery = (path: string, query: string): boolean => {
  if (!query) return true;
  if (!/[?*]/.test(query)) return path.toLowerCase().includes(query.toLowerCase());

  const pattern = query
    .split('*')
    .map((part) => escapeRegExp(part))
    .join('.*')
    .replaceAll('\\?', '.');
  return new RegExp(`^${pattern}$`, 'i').test(path);
};

export class AgentWorkspace {
  original: FileMap;
  files: FileMap;
  workspaceIndex: WorkspaceIndex | null;

  constructor(files: FileMap = {}, workspaceIndex: WorkspaceIndex | null = null) {
    this.original = { ...files };
    this.files = { ...files };
    this.workspaceIndex = workspaceIndex;
  }

  list(query = ''): string[] {
    const normalizedQuery = String(query);
    return Object.keys(this.files)
      .filter((path) => matchesPathQuery(path, normalizedQuery))
      .sort()
      .slice(0, 200);
  }

  read(path: string): string {
    const safePath = normalizeAgentPath(path);
    if (!(safePath in this.files)) throw new Error(`File not found: ${safePath}`);
    const content = String(this.files[safePath]);
    return content.length > MAX_FILE_CHARS
      ? `${content.slice(0, MAX_FILE_CHARS)}\n...[truncated]`
      : content;
  }

  search(query: string, glob = ''): Promise<string> | string {
    if (!query) throw new Error('search_workspace requires a query');
    if (this.workspaceIndex) {
      return this.workspaceIndex
        .queryText(query, 100)
        .then((indexed) => {
          const lines = indexed
            .filter((item) => !glob || matchesPathQuery(item.path, glob))
            .map((item) => `${item.path}:${item.preview.replace(/\n/g, ' ').slice(0, 240)}`);
          return lines.length
            ? lines.join('\n').slice(0, MAX_RESULT_CHARS)
            : this.searchFallback(query, glob);
        })
        .catch(() => this.searchFallback(query, glob));
    }
    return this.searchFallback(query, glob);
  }

  searchFallback(query: string, glob = ''): string {
    let matcher: RegExp | { test: (line: string) => boolean };
    if (query.startsWith('/') && query.endsWith('/') && query.length > 2) {
      matcher = new RegExp(query.slice(1, -1), 'i');
    } else {
      const needle = query.toLowerCase();
      matcher = { test: (line: string) => line.toLowerCase().includes(needle) };
    }
    const hits: string[] = [];
    for (const path of this.list()) {
      if (glob && !matchesPathQuery(path, glob)) continue;
      const content = String(this.files[path]);
      for (const [index, line] of content.split('\n').entries()) {
        if (matcher.test(line)) hits.push(`${path}:${index + 1}: ${line.slice(0, 240)}`);
        if (hits.length >= 100) return hits.join('\n').slice(0, MAX_RESULT_CHARS);
      }
    }
    return hits.join('\n').slice(0, MAX_RESULT_CHARS) || 'No matches.';
  }

  async semanticSearch(
    query: string,
    retrieveContext?: ((query: string, k: number) => Promise<SemanticSearchResult[]>) | null,
    k = 5,
  ): Promise<string> {
    if (!query) throw new Error('search_semantic requires a query');
    if (typeof retrieveContext !== 'function') {
      return 'Semantic search is unavailable in this session.';
    }
    const results = await retrieveContext(query, Math.min(Math.max(Number(k) || 5, 1), 10));
    if (!results?.length) return 'No semantic matches.';
    const lines = results.map((item) => {
      const score = typeof item.score === 'number' ? item.score.toFixed(3) : '?';
      const snippet = String(item.content || '')
        .replace(/\s+/g, ' ')
        .slice(0, 280);
      return `${item.filePath} (score ${score}): ${snippet}`;
    });
    return lines.join('\n').slice(0, MAX_RESULT_CHARS);
  }

  write(path: string, content: string): void {
    this.files[normalizeAgentPath(path)] = content;
  }

  delete(path: string): void {
    const safePath = normalizeAgentPath(path);
    if (!(safePath in this.files)) throw new Error(`File not found: ${safePath}`);
    delete this.files[safePath];
  }

  changes(): AgentChange[] {
    const paths = new Set([...Object.keys(this.original), ...Object.keys(this.files)]);
    return [...paths]
      .filter((path) => this.original[path] !== this.files[path])
      .map((path) => ({ path, before: this.original[path], after: this.files[path] }));
  }
}
