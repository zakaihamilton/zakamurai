import type { FileMap, WebLLMMessage } from '@/components/AI/types';

export type AgentContextHandoff = {
  sessionId: string;
  modelId: string;
  workspaceRevision: string;
  request: string;
  summary: string;
  relevantPaths: string[];
  fileFingerprints: Record<string, string>;
  pendingReview: boolean;
  updatedAt: number;
};

const DEFAULT_MAX_CHARS = 9000;
const DEFAULT_MAX_ENTRIES = 24;

const fingerprint = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const clip = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, Math.max(0, max - 18))}\n…[clipped]` : value;

/**
 * Browser-local, bounded handoff state for a model conversation.
 * It deliberately stores summaries and fingerprints, never full workspace files.
 */
export class AgentContextLedger {
  readonly sessionId: string;
  readonly modelId: string;
  private readonly maxChars: number;
  private readonly maxEntries: number;
  private request = '';
  private workspaceRevision = '';
  private pendingReview = false;
  private relevantPaths: string[] = [];
  private fileFingerprints: Record<string, string> = {};
  private entries: string[] = [];
  private readonly storageKey: string;

  constructor(
    sessionId: string,
    modelId: string,
    options: { maxChars?: number; maxEntries?: number } = {},
  ) {
    this.sessionId = sessionId;
    this.modelId = modelId;
    this.maxChars = options.maxChars || DEFAULT_MAX_CHARS;
    this.maxEntries = options.maxEntries || DEFAULT_MAX_ENTRIES;
    this.storageKey = `zakamurai-agent-ledger:${sessionId}:${modelId}`;
    this.restore();
  }

  begin(request: string, files: FileMap, workspaceRevision = ''): void {
    this.request = request;
    this.workspaceRevision = workspaceRevision || fingerprint(Object.keys(files).sort().join('\n'));
    this.updateFiles(files);
    this.record(`Request: ${request}`);
    this.persist();
  }

  updateFiles(files: FileMap, relevantPaths = this.relevantPaths): void {
    const paths = relevantPaths.length ? relevantPaths : Object.keys(files).slice(0, 12);
    this.relevantPaths = [...new Set(paths)].slice(0, 24);
    this.fileFingerprints = Object.fromEntries(
      this.relevantPaths
        .filter((path) => Object.hasOwn(files, path))
        .map((path) => [path, fingerprint(files[path] || '')]),
    );
    this.persist();
  }

  setPendingReview(value: boolean): void {
    this.pendingReview = value;
    this.persist();
  }

  record(value: string): void {
    const normalized = clip(value.trim(), 1400);
    if (!normalized) return;
    this.entries.push(normalized);
    while (this.entries.length > this.maxEntries || this.summary().length > this.maxChars) {
      if (this.entries.length <= 1) break;
      this.entries.shift();
    }
    this.persist();
  }

  recordMessages(messages: WebLLMMessage[]): void {
    for (const message of messages) {
      this.record(`${message.role}: ${message.content}`);
    }
  }

  summary(): string {
    return this.entries.join('\n');
  }

  handoff(): AgentContextHandoff {
    return {
      sessionId: this.sessionId,
      modelId: this.modelId,
      workspaceRevision: this.workspaceRevision,
      request: clip(this.request, 1200),
      summary: clip(this.summary(), this.maxChars),
      relevantPaths: [...this.relevantPaths],
      fileFingerprints: { ...this.fileFingerprints },
      pendingReview: this.pendingReview,
      updatedAt: Date.now(),
    };
  }

  rehydrate(handoff: AgentContextHandoff, files: FileMap): WebLLMMessage[] {
    this.request = handoff.request;
    this.workspaceRevision = handoff.workspaceRevision;
    this.pendingReview = handoff.pendingReview;
    this.relevantPaths = [...handoff.relevantPaths];
    this.fileFingerprints = { ...handoff.fileFingerprints };
    this.entries = handoff.summary ? handoff.summary.split('\n').slice(-this.maxEntries) : [];
    this.persist();
    const fileContext = this.relevantPaths
      .filter((path) => Object.hasOwn(files, path))
      .map((path) => `--- ${path} ---\n${clip(files[path], 2400)}`)
      .join('\n\n');
    return [
      {
        role: 'user',
        content: [
          'Compact context rehydration. Continue the existing prompt conversation.',
          `Request: ${this.request}`,
          this.summary(),
          fileContext || 'No previously relevant files are currently available.',
        ].join('\n\n'),
      },
    ];
  }

  private persist(): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(this.storageKey, JSON.stringify(this.handoff()));
    } catch {
      // Session handoff is an optimization; quota or privacy restrictions must not block AI.
    }
  }

  private restore(): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(this.storageKey);
      if (!raw) return;
      const handoff = JSON.parse(raw) as AgentContextHandoff;
      if (handoff.sessionId !== this.sessionId || handoff.modelId !== this.modelId) return;
      this.request = handoff.request || '';
      this.workspaceRevision = handoff.workspaceRevision || '';
      this.pendingReview = handoff.pendingReview === true;
      this.relevantPaths = Array.isArray(handoff.relevantPaths) ? handoff.relevantPaths : [];
      this.fileFingerprints = handoff.fileFingerprints || {};
      this.entries =
        typeof handoff.summary === 'string'
          ? handoff.summary.split('\n').slice(-this.maxEntries)
          : [];
    } catch {
      // Corrupt handoff data is safely ignored and rebuilt from the current workspace.
    }
  }
}

export const fingerprintWorkspace = (files: FileMap, paths?: string[]): string => {
  const selected = (paths || Object.keys(files)).sort();
  return fingerprint(
    selected.map((path) => `${path}:${fingerprint(files[path] || '')}`).join('\n'),
  );
};
