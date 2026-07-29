import type {
  AgentContextOptions,
  AgentContextSnapshot,
  ContextEntry,
  VerificationResult,
} from '@/components/AI/types';

const MAX_CONTEXT_CHARS = 14000;
const MAX_ITEM_CHARS = 1800;

const clip = (value: unknown, length = MAX_ITEM_CHARS): string => {
  const text = String(value || '');
  return text.length > length ? `${text.slice(0, length)}\n…[truncated]` : text;
};

/** A bounded, serializable record of evidence shared between local agent turns. */
export class AgentContextManager {
  request: string;
  maxContextChars: number;
  maxItemChars: number;
  entries: ContextEntry[];

  constructor({
    request = '',
    priorContext = '',
    maxContextChars = MAX_CONTEXT_CHARS,
    maxItemChars = MAX_ITEM_CHARS,
  }: AgentContextOptions = {}) {
    this.request = request;
    this.maxContextChars = maxContextChars;
    this.maxItemChars = maxItemChars;
    this.entries = priorContext ? [{ type: 'prior', text: clip(priorContext, maxItemChars) }] : [];
  }

  record(type: string, value: unknown): void {
    this.entries.push({
      type,
      text: clip(typeof value === 'string' ? value : JSON.stringify(value), this.maxItemChars),
    });
    while (this.entries.length > 1 && this.toString().length > this.maxContextChars)
      this.entries.shift();
  }

  toString(): string {
    return this.entries.map((entry) => `[${entry.type}]\n${entry.text}`).join('\n\n');
  }

  snapshot(): AgentContextSnapshot {
    return { request: this.request, entries: [...this.entries], text: this.toString() };
  }
}

export const formatVerificationResult = (result: VerificationResult | null | undefined): string => {
  if (!result) return 'Validation is unavailable.';
  return JSON.stringify({
    status: result.status || 'unavailable',
    check: result.check || 'build',
    diagnostics: clip(result.diagnostics || result.output || '', 3000),
  });
};
