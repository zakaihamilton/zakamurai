import type {
  AgentAction,
  AgentActionName,
  AgentChange,
  ManagerEvent,
  ManagerPlan,
  ManagerToolName,
} from '@/components/AI/types';

export const MANAGER_TRACE_VERSION = 1 as const;
export const MANAGER_TRACE_CLIP_LENGTH = 4000;

export type ManagerTracePhase =
  | 'routing'
  | 'tool'
  | 'context'
  | 'model'
  | 'validation'
  | 'finished'
  | 'error';

export type ManagerTraceOutcome = 'running' | 'success' | 'error' | 'aborted';

export type ManagerTraceEvent = {
  sequence: number;
  elapsedMs: number;
  phase: ManagerTracePhase;
  turn: number;
  tool?: ManagerToolName;
  action?: AgentActionName | AgentAction;
  task?: 'answer' | 'generate-changes' | 'repair-changes';
  provenance?: 'model' | 'recovery';
  plan?: ManagerPlan;
  status?: 'started' | 'completed' | 'failed';
  message?: string;
  input?: string;
  output?: string;
  errorCode?: ManagerErrorCode;
  protocolStatus?: 'request-sent' | 'response-received' | 'valid' | 'invalid';
  sessionState?: 'hit' | 'cold-start' | 'rehydrated' | 'compacted' | 'evicted';
  submittedDeltaBytes?: number;
  submittedDeltaTokens?: number;
  reusedContextTokens?: number;
};

export type ManagerTrace = {
  version: typeof MANAGER_TRACE_VERSION;
  runId: string;
  request: string;
  plan?: ManagerPlan;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  outcome: ManagerTraceOutcome;
  events: ManagerTraceEvent[];
};

export type ManagerErrorCode =
  | 'cancelled'
  | 'model'
  | 'model-protocol'
  | 'context-request'
  | 'tool'
  | 'validation'
  | 'unknown';

export type ManagerRunErrorOptions = {
  code: ManagerErrorCode;
  phase: ManagerTracePhase;
  trace: ManagerTrace;
  changes?: AgentChange[];
  cause?: unknown;
};

export class ManagerRunError extends Error {
  readonly code: ManagerErrorCode;
  readonly phase: ManagerTracePhase;
  readonly trace: ManagerTrace;
  readonly changes: AgentChange[];

  constructor(message: string, options: ManagerRunErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'ManagerRunError';
    this.code = options.code;
    this.phase = options.phase;
    this.trace = options.trace;
    this.changes = options.changes || [];
  }
}

const clip = (value: unknown): string => {
  const text = String(value ?? '');
  return text.length > MANAGER_TRACE_CLIP_LENGTH
    ? `${text.slice(0, MANAGER_TRACE_CLIP_LENGTH)}…[clipped]`
    : text;
};

const redact = (value: string): string =>
  value
    .replace(
      /((?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*)([^\s,;]+)/gi,
      '$1[REDACTED]',
    )
    .replace(/(-----BEGIN [^-]+ KEY-----)[\s\S]*?(-----END [^-]+ KEY-----)/g, '$1[REDACTED]$2');

export const sanitizeManagerTraceValue = (value: unknown): string => redact(clip(value));

const sanitizeManagerTraceAction = (
  action: AgentActionName | AgentAction | undefined,
): AgentActionName | AgentAction | undefined => {
  if (!action || typeof action === 'string') return action;
  return Object.fromEntries(
    Object.entries(action).map(([key, value]) => [
      key,
      typeof value === 'string' ? sanitizeManagerTraceValue(value) : value,
    ]),
  ) as AgentAction;
};

export class ManagerTraceRecorder {
  private value: ManagerTrace;
  private readonly clock: () => number;

  constructor(request: string, options?: { clock?: () => number; runId?: string }) {
    this.clock = options?.clock || (() => Date.now());
    const startedAt = this.clock();
    this.value = {
      version: MANAGER_TRACE_VERSION,
      runId: options?.runId || `manager-${startedAt}`,
      request: sanitizeManagerTraceValue(request),
      startedAt,
      outcome: 'running',
      events: [],
    };
  }

  record(event: Omit<ManagerTraceEvent, 'sequence' | 'elapsedMs'>) {
    const now = this.clock();
    const action = sanitizeManagerTraceAction(event.action);
    this.value = {
      ...this.value,
      plan: this.value.plan || undefined,
      events: [
        ...this.value.events,
        {
          ...event,
          ...(action ? { action } : {}),
          sequence: this.value.events.length + 1,
          elapsedMs: Math.max(0, now - this.value.startedAt),
          ...(event.message ? { message: sanitizeManagerTraceValue(event.message) } : {}),
          ...(event.input ? { input: sanitizeManagerTraceValue(event.input) } : {}),
          ...(event.output ? { output: sanitizeManagerTraceValue(event.output) } : {}),
        },
      ],
    };
    return this.snapshot();
  }

  recordManagerEvent(event: ManagerEvent) {
    const phase: ManagerTracePhase = event.type;
    return this.record({
      phase,
      turn: event.turn,
      tool: event.tool,
      action: event.action,
      task: event.task,
      provenance: event.provenance,
      status: event.error ? 'failed' : phase === 'finished' ? 'completed' : undefined,
      message: event.message,
      input: event.input,
      output: event.output,
      protocolStatus: event.protocolStatus,
      ...(event.plan ? { plan: event.plan } : {}),
    } as Omit<ManagerTraceEvent, 'sequence' | 'elapsedMs'> & { plan?: ManagerPlan });
  }

  setPlan(plan: ManagerPlan) {
    this.value = { ...this.value, plan };
    return this.snapshot();
  }

  finish(outcome: Exclude<ManagerTraceOutcome, 'running'>, errorCode?: ManagerErrorCode) {
    const endedAt = this.clock();
    this.value = {
      ...this.value,
      endedAt,
      durationMs: Math.max(0, endedAt - this.value.startedAt),
      outcome,
      ...(errorCode
        ? {
            events: [
              ...this.value.events,
              {
                sequence: this.value.events.length + 1,
                elapsedMs: Math.max(0, endedAt - this.value.startedAt),
                phase: 'error',
                turn: this.value.events.length,
                status: 'failed',
                errorCode,
              },
            ],
          }
        : {}),
    };
    return this.snapshot();
  }

  snapshot(): ManagerTrace {
    return {
      ...this.value,
      events: this.value.events.map((event) => ({ ...event })),
    };
  }
}

export const classifyManagerError = (error: unknown): ManagerErrorCode => {
  if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
  const message = error instanceof Error ? error.message : String(error);
  if (/JSON|model result|repair response/i.test(message)) return 'model-protocol';
  if (/context|path|workspace/i.test(message)) return 'context-request';
  if (/validation|syntax|build|diagnostic/i.test(message)) return 'validation';
  if (/model|WebLLM|generation/i.test(message)) return 'model';
  return 'unknown';
};
