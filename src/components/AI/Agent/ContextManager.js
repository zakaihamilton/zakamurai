const MAX_CONTEXT_CHARS = 14000;
const MAX_ITEM_CHARS = 1800;

const clip = (value, length = MAX_ITEM_CHARS) => {
  const text = String(value || '');
  return text.length > length ? `${text.slice(0, length)}\n…[truncated]` : text;
};

/** A bounded, serializable record of evidence shared between local agent turns. */
export class AgentContextManager {
  constructor({ request = '', priorContext = '' } = {}) {
    this.request = request;
    this.entries = priorContext ? [{ type: 'prior', text: clip(priorContext) }] : [];
  }

  record(type, value) {
    this.entries.push({
      type,
      text: clip(typeof value === 'string' ? value : JSON.stringify(value)),
    });
    while (this.entries.length > 1 && this.toString().length > MAX_CONTEXT_CHARS)
      this.entries.shift();
  }

  toString() {
    return this.entries.map((entry) => `[${entry.type}]\n${entry.text}`).join('\n\n');
  }

  snapshot() {
    return { request: this.request, entries: [...this.entries], text: this.toString() };
  }
}

export const formatVerificationResult = (result) => {
  if (!result) return 'Validation is unavailable.';
  return JSON.stringify({
    status: result.status || 'unavailable',
    check: result.check || 'build',
    diagnostics: clip(result.diagnostics || result.output || '', 3000),
  });
};
