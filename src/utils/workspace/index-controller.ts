const SKIP_NAMES = new Set(['node_modules', '.git', 'dist', '.next', '.npm', 'coverage']);

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type FileChangeEntry = {
  path: string;
  content?: string;
  hash?: string;
  bytes?: number;
  deleted?: boolean;
};

type IndexProfile = {
  exclude?: string[];
};

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class WorkspaceIndexController {
  worker: Worker | null;
  sequence: number;
  pending: Map<number, PendingRequest>;

  constructor() {
    this.worker = null;
    this.sequence = 0;
    this.pending = new Map();
  }

  async init(): Promise<void> {
    if (this.worker) return;
    const worker = new Worker(new URL('./workspace-index-worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker = worker;
    worker.addEventListener('message', ({ data }) => {
      const request = this.pending.get(data.id);
      if (!request) return;
      this.pending.delete(data.id);
      clearTimeout(request.timeout);
      if (data.type === 'ERROR') request.reject(new Error(data.error));
      else request.resolve(data.payload);
    });
    worker.addEventListener('error', (event: ErrorEvent) => {
      this.failWorker(new Error(event.message || 'Workspace index worker crashed.'), worker);
    });
    worker.addEventListener('messageerror', () => {
      this.failWorker(new Error('Workspace index worker message could not be decoded.'), worker);
    });
  }

  private failWorker(error: Error, expectedWorker = this.worker): void {
    if (expectedWorker && expectedWorker !== this.worker) return;
    expectedWorker?.terminate();
    if (this.worker === expectedWorker) this.worker = null;
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.pending.clear();
  }

  async request(
    type: string,
    payload: Record<string, unknown> = {},
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    await this.init();
    return new Promise((resolve, reject) => {
      const worker = this.worker;
      if (!worker) {
        reject(new Error('Workspace index worker is not available.'));
        return;
      }
      const id = ++this.sequence;
      const timeout = setTimeout(() => {
        this.failWorker(
          new Error(`Workspace index ${type} request timed out after ${timeoutMs}ms.`),
          worker,
        );
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        worker.postMessage({ id, type, payload });
      } catch (error) {
        this.failWorker(
          error instanceof Error ? error : new Error(`Workspace index ${type} request failed.`),
          worker,
        );
      }
    });
  }

  applyFileChanges(entries: FileChangeEntry[]): Promise<unknown> {
    return this.request('APPLY', { entries });
  }
  queryText(query: string, limit = 50): Promise<unknown> {
    return this.request('QUERY_TEXT', { query, limit });
  }
  getSymbols(query: string, limit = 100): Promise<unknown> {
    return this.request('SYMBOLS', { query, limit });
  }
  getHealth(): Promise<unknown> {
    return this.request('HEALTH', {});
  }
  dispose(): void {
    this.failWorker(new Error('Workspace index worker was disposed.'));
  }
}

export async function hashContent(content: string | null | undefined): Promise<string> {
  const bytes = new TextEncoder().encode(String(content || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function shouldSkipPath(path: string, profile: IndexProfile = {}): string | null {
  const parts = path.split('/');
  if (parts.some((part) => SKIP_NAMES.has(part))) return 'default exclusion';
  if ((profile.exclude || []).some((rule) => path.includes(rule))) return 'project exclusion';
  return null;
}
