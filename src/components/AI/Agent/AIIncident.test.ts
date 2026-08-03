import { describe, expect, it } from 'vitest';
import { createAIIncident, formatAIIncidentSummary } from './AIIncident';
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

  it('formats a short shareable diagnosis', () => {
    const incident = createAIIncident({
      error: new Error('model response was not JSON'),
      trace,
      selectedModelId: 'model-a',
    });

    expect(formatAIIncidentSummary(incident)).toContain('Classification: model-protocol');
    expect(formatAIIncidentSummary(incident)).not.toContain('private tic tac toe game');
  });
});
