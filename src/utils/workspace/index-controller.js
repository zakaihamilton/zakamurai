const SKIP_NAMES = new Set(['node_modules', '.git', 'dist', '.next', '.npm', 'coverage']);

export class WorkspaceIndexController {
  constructor() {
    this.worker = null;
    this.sequence = 0;
    this.pending = new Map();
  }

  async init() {
    if (this.worker) return;
    this.worker = new Worker(new URL('./workspace-index-worker.js', import.meta.url), {
      type: 'module',
    });
    this.worker.addEventListener('message', ({ data }) => {
      const request = this.pending.get(data.id);
      if (!request) return;
      this.pending.delete(data.id);
      if (data.type === 'ERROR') request.reject(new Error(data.error));
      else request.resolve(data.payload);
    });
  }

  async request(type, payload) {
    await this.init();
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload });
    });
  }

  applyFileChanges(entries) {
    return this.request('APPLY', { entries });
  }
  queryText(query, limit = 50) {
    return this.request('QUERY_TEXT', { query, limit });
  }
  getSymbols(query, limit = 100) {
    return this.request('SYMBOLS', { query, limit });
  }
  getHealth() {
    return this.request('HEALTH', {});
  }
  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}

export async function hashContent(content) {
  const bytes = new TextEncoder().encode(String(content || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function shouldSkipPath(path, profile = {}) {
  const parts = path.split('/');
  if (parts.some((part) => SKIP_NAMES.has(part))) return 'default exclusion';
  if ((profile.exclude || []).some((rule) => path.includes(rule))) return 'project exclusion';
  return null;
}
