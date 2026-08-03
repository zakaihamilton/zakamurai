import { describe, expect, it, vi } from 'vitest';
import { createAIIncident, downloadAIIncident } from './AIIncident';
import type { ManagerTrace } from './ManagerTrace';

const trace: ManagerTrace = {
  version: 1,
  runId: 'manager-incident-test',
  request: 'create a private tic tac toe game',
  startedAt: 100,
  endedAt: 250,
  durationMs: 150,
  outcome: 'error',
  plan: { intent: 'edit', steps: [], modelRequired: true, confidence: 'high' },
  events: [
    {
      sequence: 1,
      elapsedMs: 10,
      phase: 'model',
      turn: 1,
      task: 'generate-changes',
      input: 'private prompt and /Users/person/project/src/App.jsx',
      output: 'private model output with token=secret-value',
    },
    {
      sequence: 2,
      elapsedMs: 20,
      phase: 'error',
      turn: 1,
      status: 'failed',
      errorCode: 'model-protocol',
    },
  ],
};

describe('AI incident bundles', () => {
  it('projects a model-protocol failure without prompt or workspace content', () => {
    const incident = createAIIncident({
      error: new Error('The repair response was invalid at /Users/person/project/src/App.jsx'),
      trace,
      selectedModelId: 'model-a',
      cachedModelIds: ['model-a'],
      metrics: [
        {
          requestKind: 'agent',
          requestedModelId: 'model-a',
          modelId: 'model-a',
          outcome: 'error',
          startedAt: 100,
          totalMs: 50,
          recoveryCount: 2,
          failurePhase: 'generation',
          errorName: 'WebLLMStallError',
          errorMessageLength: 35,
          errorMessageFingerprint: 'fnv1a-private',
        },
      ],
      stagedChangeCount: 1,
    });

    expect(incident.classification).toBe('model-protocol');
    expect(incident.stagedChanges).toEqual({ count: 1, preserved: true });
    expect(incident.manager.events[0]).toMatchObject({
      inputLength: expect.any(Number),
      outputLength: expect.any(Number),
      inputFingerprint: expect.stringMatching(/^fnv1a-/),
      outputFingerprint: expect.stringMatching(/^fnv1a-/),
    });
    expect(incident.replay.protocolStatuses).toContain('invalid');

    const serialized = JSON.stringify(incident);
    expect(serialized).not.toContain('private tic tac toe game');
    expect(serialized).not.toContain('private model output');
    expect(serialized).not.toContain('secret-value');
    expect(serialized).not.toContain('/Users/person/project');
    expect(serialized).not.toContain('The repair response was invalid');
    expect(serialized).not.toContain('private prompt should not be copied');
    expect(incident.failure.message).toBe(
      'The local model did not produce a valid Manager protocol response.',
    );
  });

  it('captures WebLLM metrics, engine state, recovery details, and optional trace fields', () => {
    Object.defineProperties(navigator, {
      hardwareConcurrency: { configurable: true, value: 8 },
      deviceMemory: { configurable: true, value: 4 },
    });
    vi.stubGlobal('crossOriginIsolated', true);

    const incident = createAIIncident({
      error: { name: 'WebLLMError', cause: { name: 'WorkerError' } },
      trace: {
        version: 1,
        runId: 'manager-runtime-test',
        request: 'diagnose runtime',
        startedAt: 100,
        outcome: 'running',
        events: [
          {
            sequence: 1,
            elapsedMs: 1,
            phase: 'model',
            turn: 1,
            tool: 'read_file',
            task: 'answer',
            provenance: 'model',
            status: 'started',
            action: { action: 'read_file', path: 'src/App.tsx' },
            input: 'request',
            protocolStatus: 'request-sent',
          },
          {
            sequence: 2,
            elapsedMs: 2,
            phase: 'model',
            turn: 1,
            output: 'response',
          },
          {
            sequence: 3,
            elapsedMs: 3,
            phase: 'validation',
            turn: 1,
            protocolStatus: 'valid',
          },
        ],
      },
      selectedModelId: '',
      metrics: [
        {
          requestKind: 'agent',
          requestedModelId: 'model-a',
          modelId: 'model-b',
          outcome: 'success',
          startedAt: 100,
          totalMs: 50,
          initializationMs: 10,
          timeToFirstTokenMs: 20,
          promptTokens: 30,
          completionTokens: 40,
          decodeTokensPerSecond: 5,
          finishReason: 'stop',
          recoveryCount: 1,
          jsHeapUsedMBAtStart: 100,
          jsHeapUsedMBAtEnd: 110,
          jsHeapDeltaMB: 10,
          errorName: 'TransientError',
          errorMessageLength: 12,
          errorMessageFingerprint: 'fnv1a-error',
        },
      ],
      recoveries: [
        {
          requestedModelId: 'model-a',
          modelId: 'model-b',
          phase: 'generation',
          action: 'fallback',
          reason: 'worker-failure',
          attempt: 2,
        },
      ],
      cachedModelIds: ['model-a', 'model-a'],
      engines: {
        'model-a': { status: 'ready', generating: false, error: 'stale' },
      },
    });

    expect(incident.classification).toBe('webllm-runtime');
    expect(incident.failure).toMatchObject({ name: 'WebLLMError', causeName: 'WorkerError' });
    expect(incident.models).toMatchObject({
      requestedModelIds: ['model-a'],
      actualModelIds: ['model-b'],
      cachedModelIds: ['model-a'],
      engines: { 'model-a': { status: 'ready', generating: false, error: 'stale' } },
    });
    expect(incident.webllm.metrics[0]).toMatchObject({
      initializationMs: 10,
      timeToFirstTokenMs: 20,
      promptTokens: 30,
      completionTokens: 40,
      decodeTokensPerSecond: 5,
      finishReason: 'stop',
      jsHeapUsedMBAtStart: 100,
      jsHeapUsedMBAtEnd: 110,
      jsHeapDeltaMB: 10,
    });
    expect(incident.replay).toMatchObject({
      modelResponseCount: 1,
      protocolStatuses: ['request-sent', 'response-received', 'valid'],
    });
    vi.unstubAllGlobals();
  });

  it('handles missing runtime context, unknown failures, and download', () => {
    vi.stubGlobal('navigator', undefined);
    const incident = createAIIncident({ error: 0, selectedModelId: '', stagedChangeCount: 0 });
    expect(incident).toMatchObject({
      classification: 'unknown',
      runtime: {
        userAgent: 'unknown',
        hardwareConcurrency: null,
        deviceMemoryGB: null,
        crossOriginIsolated: null,
        online: null,
      },
      manager: { runId: null, outcome: null, durationMs: null, eventCount: 0 },
      stagedChanges: { count: 0, preserved: false },
    });
    const createObjectURL = vi.fn(() => 'blob:incident');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    downloadAIIncident(incident);
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:incident');
    expect(click).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
    click.mockRestore();
  });
});
