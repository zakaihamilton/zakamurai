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
