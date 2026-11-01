import type {
  WebLLMGenerationMetrics,
  WebLLMOptions,
  WebLLMRecoveryEvent,
} from '@/components/AI/types';
import { reportDiagnostic } from '@/components/Diagnostics/Diagnostics';
import { unwrapAttemptError } from './WebLLMRecovery';

export const errorFingerprint = (value: string): string => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return `fnv1a-${(result >>> 0).toString(16).padStart(8, '0')}`;
};

export const readUsedJSHeapMB = (): number | undefined => {
  if (typeof performance === 'undefined') return undefined;
  const memory = (
    performance as Performance & {
      memory?: { usedJSHeapSize?: number };
    }
  ).memory;
  if (!Number.isFinite(memory?.usedJSHeapSize)) return undefined;
  return Math.round(((memory?.usedJSHeapSize || 0) / (1024 * 1024)) * 100) / 100;
};

export function safeCallback<T>(callback: ((value: T) => void) | null | undefined, value: T): void {
  try {
    callback?.(value);
  } catch (error) {
    console.warn('[WebLLM] Consumer callback failed:', error);
  }
}

export const emitRecovery = (options: WebLLMOptions, event: WebLLMRecoveryEvent) => {
  safeCallback(options.onRecovery, event);
  reportDiagnostic({
    source: 'webllm',
    severity: 'warning',
    message: `${event.action} during ${event.phase}`,
    details: JSON.stringify(event),
  });
};

export const emitMetrics = (options: WebLLMOptions, metrics: WebLLMGenerationMetrics) => {
  safeCallback(options.onMetrics, metrics);
  reportDiagnostic({
    source: 'webllm',
    severity: metrics.outcome === 'error' ? 'error' : 'info',
    message: `Local AI ${metrics.requestKind} ${metrics.outcome}`,
    details: JSON.stringify(metrics),
  });
};

export const emitFailureDiagnostic = (error: unknown, metrics: WebLLMGenerationMetrics) => {
  const unwrapped = unwrapAttemptError(error);
  const failure = unwrapped as { name?: unknown; message?: unknown };
  const message = typeof failure?.message === 'string' ? failure.message : String(unwrapped);
  reportDiagnostic({
    source: 'webllm',
    severity: 'error',
    message: 'Local AI request failed',
    details: JSON.stringify({
      phase: metrics.failurePhase || 'unknown',
      requestKind: metrics.requestKind,
      requestedModelId: metrics.requestedModelId,
      modelId: metrics.modelId,
      errorName: typeof failure?.name === 'string' ? failure.name : undefined,
      errorMessageLength: message.length,
      errorMessageFingerprint: errorFingerprint(message),
      recoveryCount: metrics.recoveryCount,
    }),
  });
};

const estimateMessageTokens = (message: { content?: string }): number =>
  Math.ceil((message.content?.length || 0) / 3) + 4;

/**
 * WebLLM chat templates require one system message at index zero. Session
 * compaction and recovery can otherwise leave a valid system message later in
 * the array (or duplicate it), which native chat formatting rejects.
 */
export function ensureSystemMessageFirst<T extends { role: string }>(messages: T[]): T[] {
  const systemIndex = messages.findIndex((message) => message?.role === 'system');
  if (systemIndex < 0) return messages;
  const system = messages[systemIndex];
  return [
    system,
    ...messages.filter((message, index) => index !== systemIndex && message.role !== 'system'),
  ];
}

const truncatePreservingEdges = (content: string, maxChars: number): string => {
  if (content.length <= maxChars) return content;
  const marker = '\n…[context truncated]…\n';
  const remaining = maxChars - marker.length;
  const head = Math.ceil(remaining * 0.6);
  return `${content.slice(0, head)}${marker}${content.slice(-(remaining - head))}`;
};

export function pruneWebLLMMessages<T extends { role: string; content?: string }>(
  messages: T[],
  maxTokens = 2800,
): T[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const result = ensureSystemMessageFirst(messages.map((message) => ({ ...message }))) as T[];
  const tokenCount = () => result.reduce((sum, message) => sum + estimateMessageTokens(message), 0);

  while (tokenCount() > maxTokens && result.length > 4) {
    result.splice(2, 2);
  }

  const reducibleIndexes = [
    ...(result.length > 1 ? [1] : []),
    ...Array.from({ length: Math.max(0, result.length - 3) }, (_, index) => index + 2),
    ...(result.length > 2 ? [result.length - 1] : []),
    0,
  ];
  for (const index of reducibleIndexes) {
    const current = result[index];
    if (!current?.content || tokenCount() <= maxTokens) break;
    const minimumChars = index === 0 ? 240 : 120;
    const excessChars = Math.max(0, (tokenCount() - maxTokens) * 3);
    const targetChars = Math.max(minimumChars, current.content.length - excessChars);
    result[index] = {
      ...current,
      content: truncatePreservingEdges(current.content, targetChars),
    };
  }

  return result;
}
