import { normalizeAgentPath } from './Protocol';

const MAX_FILE_CHARS = 20000;
const MAX_RESULT_CHARS = 12000;

export class AgentWorkspace {
  constructor(files = {}, workspaceIndex = null) {
    this.original = { ...files };
    this.files = { ...files };
    this.workspaceIndex = workspaceIndex;
  }

  list(query = '') {
    const needle = String(query).toLowerCase();
    return Object.keys(this.files)
      .filter((path) => !needle || path.toLowerCase().includes(needle))
      .sort()
      .slice(0, 200);
  }

  read(path) {
    const safePath = normalizeAgentPath(path);
    if (!(safePath in this.files)) throw new Error(`File not found: ${safePath}`);
    const content = String(this.files[safePath]);
    return content.length > MAX_FILE_CHARS
      ? `${content.slice(0, MAX_FILE_CHARS)}\n...[truncated]`
      : content;
  }

  search(query, glob = '') {
    if (!query) throw new Error('search_workspace requires a query');
    if (this.workspaceIndex) {
      return this.workspaceIndex
        .queryText(query, 100)
        .then((indexed) => {
          const lines = indexed
            .filter((item) => !glob || item.path.endsWith(glob))
            .map((item) => `${item.path}:${item.preview.replace(/\n/g, ' ').slice(0, 240)}`);
          return lines.length
            ? lines.join('\n').slice(0, MAX_RESULT_CHARS)
            : this.searchFallback(query, glob);
        })
        .catch(() => this.searchFallback(query, glob));
    }
    return this.searchFallback(query, glob);
  }

  searchFallback(query, glob = '') {
    let matcher;
    if (query.startsWith('/') && query.endsWith('/') && query.length > 2) {
      matcher = new RegExp(query.slice(1, -1), 'i');
    } else {
      const needle = query.toLowerCase();
      matcher = { test: (line) => line.toLowerCase().includes(needle) };
    }
    const hits = [];
    for (const path of this.list()) {
      if (glob && !path.endsWith(glob)) continue;
      const content = String(this.files[path]);
      for (const [index, line] of content.split('\n').entries()) {
        if (matcher.test(line)) hits.push(`${path}:${index + 1}: ${line.slice(0, 240)}`);
        if (hits.length >= 100) return hits.join('\n').slice(0, MAX_RESULT_CHARS);
      }
    }
    return hits.join('\n').slice(0, MAX_RESULT_CHARS) || 'No matches.';
  }

  /**
   * Semantic search over the RAG index. Falls back to a short notice when empty.
   * @param {string} query
   * @param {number} [k=5]
   * @param {(query: string, k: number) => Promise<Array>} retrieveContext
   */
  async semanticSearch(query, retrieveContext, k = 5) {
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

  write(path, content) {
    this.files[normalizeAgentPath(path)] = content;
  }

  delete(path) {
    const safePath = normalizeAgentPath(path);
    if (!(safePath in this.files)) throw new Error(`File not found: ${safePath}`);
    delete this.files[safePath];
  }

  changes() {
    const paths = new Set([...Object.keys(this.original), ...Object.keys(this.files)]);
    return [...paths]
      .filter((path) => this.original[path] !== this.files[path])
      .map((path) => ({ path, before: this.original[path], after: this.files[path] }));
  }
}
