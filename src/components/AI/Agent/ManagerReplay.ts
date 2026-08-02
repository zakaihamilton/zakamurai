import type {
  FileMap,
  ManagerModelCall,
  RunManagerResult,
  VerificationResult,
} from '@/components/AI/types';
import { runManager } from './ManagerRunner';
import { ManagerRunError, type ManagerTrace } from './ManagerTrace';

export type ManagerReplayFixture = {
  version: 1;
  name: string;
  request: string;
  files: FileMap;
  model?: string;
  scope?: 'file' | 'project';
  activeFile?: string | null;
  selectedLines?: number[];
  priorContext?: string;
  modelResponses?: string[];
  validationResponses?: Array<VerificationResult | string>;
  projectCheckResponses?: Record<string, string>;
  previewResponse?: unknown;
  expected?: {
    intent?: string;
    outcome?: 'success' | 'error' | 'aborted';
    modelCalls?: number;
    toolOrder?: string[];
  };
};

export type ManagerReplayResult = {
  fixture: ManagerReplayFixture;
  result: RunManagerResult | null;
  error: ManagerRunError | null;
  trace: ManagerTrace;
  toolOrder: string[];
  modelCalls: ManagerModelCall[];
};

const parseEventInput = (input?: string): Record<string, unknown> | null => {
  if (!input) return null;
  try {
    const value = JSON.parse(input);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const parseValidationOutput = (output?: string): VerificationResult | string | null => {
  if (!output) return null;
  try {
    const value = JSON.parse(output);
    return value && typeof value === 'object' ? (value as VerificationResult) : output;
  } catch {
    return output;
  }
};

/**
 * Converts a development trace into a portable replay fixture using the
 * caller's current workspace snapshot. Trace values are already clipped and
 * redacted, so this intentionally produces a best-effort diagnostic fixture.
 */
export function createManagerReplayFixtureFromTrace(
  trace: ManagerTrace,
  files: FileMap,
): ManagerReplayFixture {
  const modelResponses = trace.events
    .filter((event) => event.phase === 'model' && event.output)
    .map((event) => event.output as string);
  const readEvent = trace.events.find(
    (event) => event.phase === 'tool' && event.tool === 'read_file',
  );
  const readInput = parseEventInput(readEvent?.input);
  const validationResponses = trace.events
    .filter((event) => event.phase === 'validation' && event.output)
    .map((event) => parseValidationOutput(event.output))
    .filter((value): value is VerificationResult | string => value !== null);

  return {
    version: 1,
    name: `trace-${trace.runId}`,
    request: trace.request,
    files: { ...files },
    activeFile: typeof readInput?.path === 'string' ? readInput.path : undefined,
    modelResponses,
    ...(validationResponses.length ? { validationResponses } : {}),
    expected: {
      intent: trace.plan?.intent,
      ...(trace.outcome === 'running' ? {} : { outcome: trace.outcome }),
      modelCalls: modelResponses.length,
    },
  };
}

export async function replayManagerFixture(
  fixture: ManagerReplayFixture,
): Promise<ManagerReplayResult> {
  if (fixture.version !== 1)
    throw new Error(`Unsupported manager fixture version: ${fixture.version}`);

  const modelResponses = [...(fixture.modelResponses || [])];
  const validationResponses = [...(fixture.validationResponses || [])];
  const toolOrder: string[] = [];
  const modelCalls: ManagerModelCall[] = [];
  let trace: ManagerTrace | null = null;

  try {
    const result = await runManager({
      request: fixture.request,
      files: fixture.files,
      model: fixture.model || 'manager-replay',
      scope: fixture.scope,
      activeFile: fixture.activeFile,
      selectedLines: fixture.selectedLines,
      priorContext: fixture.priorContext,
      modelClient: async (call) => {
        modelCalls.push(call);
        const response = modelResponses.shift();
        if (response === undefined) {
          throw new Error(`Replay fixture '${fixture.name}' ran out of model responses.`);
        }
        return response;
      },
      validate: fixture.validationResponses
        ? async () => validationResponses.shift() || { status: 'passed' }
        : undefined,
      runProjectCheck: fixture.projectCheckResponses
        ? async (check) => fixture.projectCheckResponses?.[check] || ''
        : undefined,
      inspectPreview:
        fixture.previewResponse === undefined ? undefined : async () => fixture.previewResponse,
      onEvent: (event) => {
        if (event.type === 'tool' && event.tool) toolOrder.push(event.tool);
        if (event.type === 'validation') toolOrder.push('validate');
      },
      onTrace: (nextTrace) => {
        trace = nextTrace;
      },
    });
    if (!trace) throw new Error(`Replay fixture '${fixture.name}' produced no trace.`);
    return { fixture, result, error: null, trace, toolOrder, modelCalls };
  } catch (error) {
    if (!(error instanceof ManagerRunError)) throw error;
    return {
      fixture,
      result: null,
      error,
      trace: error.trace,
      toolOrder,
      modelCalls,
    };
  }
}
