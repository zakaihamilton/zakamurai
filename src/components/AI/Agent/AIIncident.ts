import type {
  WebLLMEngineState,
  WebLLMGenerationMetrics,
  WebLLMRecoveryEvent,
} from '@/components/AI/types';
import { redactDiagnosticText } from '@/contracts/runtime';
import type { ManagerErrorCode, ManagerTrace } from './ManagerTrace';

export const AI_INCIDENT_VERSION = 1 as const;
export const AI_INCIDENT_REPLAY_VERSION = 1 as const;

export type AIIncidentEvent = {
  sequence: number;
  elapsedMs: number;
  phase: string;
  turn: number;
  tool?: string;
  task?: string;
  provenance?: string;
  status?: string;
  errorCode?: string;
  action?: string;
  inputLength?: number;
  outputLength?: number;
  inputFingerprint?: string;
  outputFingerprint?: string;
  protocolStatus?: 'request-sent' | 'response-received' | 'valid' | 'invalid';
};

export type AIIncident = {
  version: typeof AI_INCIDENT_VERSION;
  id: string;
  createdAt: string;
  summary: string;
  classification: ManagerErrorCode | 'webllm-runtime' | 'unknown';
  failure: {
    phase: string;
    code: string;
    name?: string;
    message: string;
    detailLength: number;
    detailFingerprint: string;
    causeName?: string;
  };
  runtime: {
    userAgent: string;
    platform: string;
    language: string;
    hardwareConcurrency: number | null;
    deviceMemoryGB: number | null;
    crossOriginIsolated: boolean | null;
    online: boolean | null;
  };
  models: {
    selectedModelId: string;
    requestedModelIds: string[];
    actualModelIds: string[];
    cachedModelIds: string[];
    engines: Record<string, Pick<WebLLMEngineState, 'status' | 'generating' | 'error'>>;
  };
  webllm: {
    metrics: Array<
      Pick<
        WebLLMGenerationMetrics,
        | 'requestKind'
        | 'requestedModelId'
        | 'modelId'
        | 'outcome'
        | 'startedAt'
        | 'totalMs'
        | 'initializationMs'
        | 'timeToFirstTokenMs'
        | 'promptTokens'
        | 'completionTokens'
        | 'decodeTokensPerSecond'
        | 'finishReason'
        | 'recoveryCount'
        | 'jsHeapUsedMBAtStart'
        | 'jsHeapUsedMBAtEnd'
        | 'jsHeapDeltaMB'
        | 'failurePhase'
        | 'errorName'
        | 'errorMessageLength'
        | 'errorMessageFingerprint'
      >
    >;
    recoveries: WebLLMRecoveryEvent[];
  };
  manager: {
    runId: string | null;
    outcome: string | null;
    durationMs: number | null;
    eventCount: number;
    intent?: string;
    confidence?: string;
    events: AIIncidentEvent[];
  };
  stagedChanges: {
    count: number;
    preserved: boolean;
  };
  replay: {
    version: typeof AI_INCIDENT_REPLAY_VERSION;
    runId: string | null;
    eventSequences: number[];
    modelResponseCount: number;
    protocolStatuses: string[];
  };
};

export type CreateAIIncidentInput = {
  error: unknown;
  source?: 'manager' | 'webllm';
  trace?: ManagerTrace | null;
  selectedModelId: string;
  metrics?: WebLLMGenerationMetrics[];
  recoveries?: WebLLMRecoveryEvent[];
  cachedModelIds?: string[];
  engines?: Record<string, WebLLMEngineState>;
  stagedChangeCount?: number;
};

const text = (value: unknown): string => redactDiagnosticText(value);

const errorMessage = (error: unknown): string =>
  text(error instanceof Error ? error.message : String(error || 'Unknown AI failure'));

const errorName = (error: unknown): string | undefined =>
  error && typeof error === 'object' && typeof (error as { name?: unknown }).name === 'string'
    ? text((error as { name: string }).name)
    : undefined;

const causeName = (error: unknown): string | undefined => {
  const cause = error && typeof error === 'object' ? (error as { cause?: unknown }).cause : null;
  return errorName(cause);
};

const hash = (value: string): string => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return `fnv1a-${(result >>> 0).toString(16).padStart(8, '0')}`;
};

const lengthOf = (value?: string): number | undefined =>
  typeof value === 'string' ? value.length : undefined;

const projectTraceEvent = (event: ManagerTrace['events'][number]): AIIncidentEvent => {
  const action = typeof event.action === 'string' ? event.action : event.action?.action;
  const projected: AIIncidentEvent = {
    sequence: event.sequence,
    elapsedMs: event.elapsedMs,
    phase: event.phase,
    turn: event.turn,
    ...(event.tool ? { tool: event.tool } : {}),
    ...(event.task ? { task: event.task } : {}),
    ...(event.provenance ? { provenance: event.provenance } : {}),
    ...(event.status ? { status: event.status } : {}),
    ...(event.errorCode ? { errorCode: event.errorCode } : {}),
    ...(action ? { action } : {}),
    ...(event.input
      ? { inputLength: lengthOf(event.input), inputFingerprint: hash(event.input) }
      : {}),
    ...(event.output
      ? { outputLength: lengthOf(event.output), outputFingerprint: hash(event.output) }
      : {}),
  };
  if (event.protocolStatus) projected.protocolStatus = event.protocolStatus;
  else if (event.phase === 'error' && event.errorCode === 'model-protocol') {
    projected.protocolStatus = 'invalid';
  } else if (event.phase === 'model' && event.output) {
    projected.protocolStatus = 'response-received';
  } else if (event.phase === 'model' && event.input) {
    projected.protocolStatus = 'request-sent';
  }
  return projected;
};

const runtimeMetadata = () => {
  if (typeof navigator === 'undefined') {
    return {
      userAgent: 'unknown',
      platform: 'unknown',
      language: 'unknown',
      hardwareConcurrency: null,
      deviceMemoryGB: null,
      crossOriginIsolated: null,
      online: null,
    };
  }
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return {
    userAgent: text(navigator.userAgent),
    platform: text(navigator.platform),
    language: text(navigator.language),
    hardwareConcurrency: Number.isFinite(navigator.hardwareConcurrency)
      ? navigator.hardwareConcurrency
      : null,
    deviceMemoryGB: Number.isFinite(deviceMemory) ? deviceMemory || null : null,
    crossOriginIsolated: typeof crossOriginIsolated === 'boolean' ? crossOriginIsolated : null,
    online: typeof navigator.onLine === 'boolean' ? navigator.onLine : null,
  };
};

const managerClassification = (
  trace: ManagerTrace | null | undefined,
): AIIncident['classification'] => {
  const errorEvent = trace?.events.findLast((event) => event.phase === 'error');
  if (errorEvent?.errorCode) return errorEvent.errorCode;
  return 'unknown';
};

export function createAIIncident({
  error,
  source = 'manager',
  trace = null,
  selectedModelId,
  metrics = [],
  recoveries = [],
  cachedModelIds = [],
  engines = {},
  stagedChangeCount = 0,
}: CreateAIIncidentInput): AIIncident {
  const failureCode = managerClassification(trace);
  const classification =
    source === 'webllm' || (failureCode === 'unknown' && metrics.length)
      ? 'webllm-runtime'
      : failureCode;
  const latestMetric = metrics.at(-1);
  const phase =
    latestMetric?.failurePhase ||
    trace?.events.findLast((event) => event.phase === 'error')?.phase ||
    'unknown';
  const detail = errorMessage(error);
  const runId = trace?.runId || null;
  const events = trace?.events.map(projectTraceEvent) || [];
  const actualModelIds = [...new Set(metrics.map((metric) => metric.modelId).filter(Boolean))];
  const requestedModelIds = [
    ...new Set(metrics.map((metric) => metric.requestedModelId).filter(Boolean)),
  ];
  const projectedEngines = Object.fromEntries(
    Object.entries(engines).map(([modelId, engine]) => [
      modelId,
      {
        ...(engine.status ? { status: engine.status } : {}),
        ...(typeof engine.generating === 'boolean' ? { generating: engine.generating } : {}),
        ...(engine.error ? { error: text(engine.error) } : {}),
      },
    ]),
  );
  const protocolStatuses: string[] = [
    ...new Set(
      events
        .map((event) => event.protocolStatus)
        .filter((value): value is Exclude<typeof value, undefined> => Boolean(value)),
    ),
  ];
  const modelResponseCount = events.filter(
    (event) => event.protocolStatus === 'response-received',
  ).length;
  const summary =
    classification === 'model-protocol'
      ? 'The local model did not produce a valid Manager protocol response.'
      : classification === 'webllm-runtime'
        ? 'The local WebLLM runtime failed during model execution.'
        : 'The AI Manager stopped with an error.';

  return {
    version: AI_INCIDENT_VERSION,
    id: `ai-incident-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    summary,
    classification,
    failure: {
      phase,
      code: failureCode,
      ...(errorName(error) ? { name: errorName(error) } : {}),
      message: summary,
      detailLength: detail.length,
      detailFingerprint: hash(detail),
      ...(causeName(error) ? { causeName: causeName(error) } : {}),
    },
    runtime: runtimeMetadata(),
    models: {
      selectedModelId,
      requestedModelIds,
      actualModelIds,
      cachedModelIds: [...new Set(cachedModelIds)],
      engines: projectedEngines,
    },
    webllm: {
      metrics: metrics.map((metric) => ({
        requestKind: metric.requestKind,
        requestedModelId: metric.requestedModelId,
        modelId: metric.modelId,
        outcome: metric.outcome,
        startedAt: metric.startedAt,
        totalMs: metric.totalMs,
        ...(metric.initializationMs !== undefined
          ? { initializationMs: metric.initializationMs }
          : {}),
        ...(metric.timeToFirstTokenMs !== undefined
          ? { timeToFirstTokenMs: metric.timeToFirstTokenMs }
          : {}),
        ...(metric.promptTokens !== undefined ? { promptTokens: metric.promptTokens } : {}),
        ...(metric.completionTokens !== undefined
          ? { completionTokens: metric.completionTokens }
          : {}),
        ...(metric.decodeTokensPerSecond !== undefined
          ? { decodeTokensPerSecond: metric.decodeTokensPerSecond }
          : {}),
        ...(metric.finishReason !== undefined ? { finishReason: metric.finishReason } : {}),
        recoveryCount: metric.recoveryCount,
        ...(metric.jsHeapUsedMBAtStart !== undefined
          ? { jsHeapUsedMBAtStart: metric.jsHeapUsedMBAtStart }
          : {}),
        ...(metric.jsHeapUsedMBAtEnd !== undefined
          ? { jsHeapUsedMBAtEnd: metric.jsHeapUsedMBAtEnd }
          : {}),
        ...(metric.jsHeapDeltaMB !== undefined ? { jsHeapDeltaMB: metric.jsHeapDeltaMB } : {}),
        ...(metric.failurePhase ? { failurePhase: metric.failurePhase } : {}),
        ...(metric.errorName ? { errorName: metric.errorName } : {}),
        ...(metric.errorMessageLength !== undefined
          ? { errorMessageLength: metric.errorMessageLength }
          : {}),
        ...(metric.errorMessageFingerprint
          ? { errorMessageFingerprint: metric.errorMessageFingerprint }
          : {}),
      })),
      recoveries: recoveries.map((recovery) => ({ ...recovery })),
    },
    manager: {
      runId,
      outcome: trace?.outcome || null,
      durationMs: trace?.durationMs ?? null,
      eventCount: events.length,
      ...(trace?.plan?.intent ? { intent: trace.plan.intent } : {}),
      ...(trace?.plan?.confidence ? { confidence: trace.plan.confidence } : {}),
      events,
    },
    stagedChanges: { count: stagedChangeCount, preserved: stagedChangeCount > 0 },
    replay: {
      version: AI_INCIDENT_REPLAY_VERSION,
      runId,
      eventSequences: events.map((event) => event.sequence),
      modelResponseCount,
      protocolStatuses,
    },
  };
}

export function downloadAIIncident(incident: AIIncident): void {
  const blob = new Blob([JSON.stringify(incident, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${incident.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
