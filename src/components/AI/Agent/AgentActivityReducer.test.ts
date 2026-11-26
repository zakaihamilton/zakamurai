import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ManagerPlan, WebLLMRecoveryEvent } from '@/components/AI/types';
import type { AgentActivityState } from '@/types/domain-types';
import { createIdleAgentActivity, createRunningAgentActivity, node } from './AgentActivityNodes';
import {
  applyManagerPlan,
  applyManagerTrace,
  applyRecovery,
  finishAgentActivity,
} from './AgentActivityReducer';
import type { ManagerTrace } from './ManagerTrace';

const basePlan: ManagerPlan = {
  intent: 'edit',
  modelRequired: true,
  confidence: 'high',
  steps: [
    { kind: 'tool', tool: 'read_file', reason: 'Inspect target file.' },
    { kind: 'model', task: 'generate-changes', reason: 'Produce edits.' },
    { kind: 'tool', tool: 'validate', reason: 'Verify edits.' },
  ],
};

const makeTrace = (
  events: ManagerTrace['events'],
  patch: Partial<ManagerTrace> = {},
): ManagerTrace => ({
  version: 1,
  runId: 'run-42',
  request: 'Update the widget',
  startedAt: 1_000,
  outcome: 'running',
  events,
  ...patch,
});

const makeEvent = (
  sequence: number,
  phase: ManagerTrace['events'][number]['phase'],
  patch: Partial<ManagerTrace['events'][number]> = {},
): ManagerTrace['events'][number] => ({
  sequence,
  elapsedMs: sequence * 50,
  phase,
  turn: sequence,
  ...patch,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AgentActivityReducer', () => {
  it('applies manager plans while preserving existing nodes, observed events, and current phase', () => {
    const blankRunning: AgentActivityState = {
      ...createRunningAgentActivity(''),
      currentPhase: null,
      currentNodeId: 'route',
      nodes: [
        node({
          id: 'event-9',
          phase: 'work',
          kind: 'tool',
          label: 'Observed tool',
          status: 'completed',
          detail: 'Ran early',
        }),
      ],
    };

    const planned = applyManagerPlan(blankRunning, basePlan);
    expect(planned.currentPhase).toBe('context');
    expect(planned.currentNodeId).toBeNull();
    expect(planned.nodes.find((item) => item.id === 'request')?.detail).toBe(
      'User request received.',
    );
    expect(planned.nodes.find((item) => item.id === 'route')?.detail).toBe(
      'Request routed to edit.',
    );
    const observedIdx = planned.nodes.findIndex((item) => item.id === 'event-9');
    const resultIdx = planned.nodes.findIndex((item) => item.id === 'result');
    expect(observedIdx).toBeGreaterThan(-1);
    expect(observedIdx).toBeLessThan(resultIdx);

    const withExistingContext: AgentActivityState = {
      ...planned,
      currentPhase: 'work',
      currentNodeId: 'plan-0',
      nodes: planned.nodes.map((item) =>
        item.id === 'context'
          ? { ...item, status: 'completed', detail: 'Custom context', timestamp: '10:00:00.000' }
          : item,
      ),
    };
    const replanned = applyManagerPlan(withExistingContext, basePlan);
    expect(replanned.currentPhase).toBe('work');
    expect(replanned.currentNodeId).toBe('plan-0');
    expect(replanned.nodes.find((item) => item.id === 'context')).toMatchObject({
      status: 'completed',
      timestamp: '10:00:00.000',
    });
  });

  it('applies trace plans from trace.plan or event.plan and deduplicates sequences', () => {
    const start = createRunningAgentActivity('Trace test', 1_000);
    const first = applyManagerTrace(
      start,
      makeTrace(
        [
          makeEvent(1, 'routing', { plan: basePlan, message: 'Routed.' }),
          makeEvent(2, 'context', { status: 'started', message: 'Gathering context.' }),
        ],
        { durationMs: 120 },
      ),
    );
    expect(first.lastTraceSequence).toBe(2);
    expect(first.durationMs).toBe(120);
    expect(first.currentNodeId).toBe('context');
    expect(first.nodes.find((item) => item.id === 'route')?.status).toBe('completed');

    const second = applyManagerTrace(
      first,
      makeTrace([
        makeEvent(1, 'routing', { message: 'Should be ignored' }),
        makeEvent(2, 'context', { status: 'started', message: 'Ignored' }),
        makeEvent(3, 'context', {
          tool: 'list_files',
          message: 'Listed files',
          input: '{}',
          output: '["src/a.ts"]',
        }),
      ]),
    );
    expect(second.lastTraceSequence).toBe(3);
    expect(second.nodes.find((item) => item.id === 'event-3')).toMatchObject({
      status: 'completed',
      detail: 'Listed files',
    });
  });

  it('handles planned target completions, context tool side-effects, and observed active events', () => {
    const planned = applyManagerPlan(createRunningAgentActivity('Work', 1_000), {
      intent: 'edit',
      modelRequired: true,
      confidence: 'high',
      steps: [
        { kind: 'tool', tool: 'list_files', reason: 'List workspace.' },
        { kind: 'model', task: 'generate-changes', reason: 'Generate edits.' },
        { kind: 'tool', tool: 'validate', reason: 'Validate edits.' },
      ],
    });

    // Context tool event completing a planned list_files node when currentNodeId is NOT plan-0
    const contextToolDone = applyManagerTrace(
      planned,
      makeTrace([
        makeEvent(1, 'context', {
          tool: 'list_files',
          message: 'Found 3 files',
          input: 'root',
          output: 'a,b,c',
          provenance: 'model',
        }),
      ]),
    );
    expect(contextToolDone.nodes.find((item) => item.id === 'plan-0')).toMatchObject({
      status: 'completed',
      input: 'root',
      output: 'a,b,c',
      provenance: 'model',
    });
    expect(contextToolDone.nodes.find((item) => item.id === 'context')).toMatchObject({
      status: 'completed',
      detail: 'Workspace context gathered.',
    });

    // Model protocol completion clears currentNodeId when target was active
    const modelActiveAndDone = applyManagerTrace(
      contextToolDone,
      makeTrace([
        makeEvent(2, 'model', {
          task: 'generate-changes',
          protocolStatus: 'request-sent',
          message: 'Sending prompt',
        }),
      ]),
    );
    expect(modelActiveAndDone.currentNodeId).toBe('plan-1');
    expect(modelActiveAndDone.nodes.find((item) => item.id === 'plan-1')?.status).toBe('active');

    const modelCompleted = applyManagerTrace(
      modelActiveAndDone,
      makeTrace([
        makeEvent(3, 'model', {
          task: 'generate-changes',
          protocolStatus: 'response-received',
          message: 'Model responded',
        }),
      ]),
    );
    expect(modelCompleted.currentNodeId).toBeNull();
    expect(modelCompleted.nodes.find((item) => item.id === 'plan-1')?.status).toBe('completed');

    // Validation started without message, output, or protocolStatus activates validation node
    const validationStarted = applyManagerTrace(
      modelCompleted,
      makeTrace([makeEvent(4, 'validation', { status: 'started' })]),
    );
    expect(validationStarted.currentNodeId).toBe('plan-2');
    expect(validationStarted.nodes.find((item) => item.id === 'plan-2')?.status).toBe('active');

    // Validation completion detected via message wording
    const validationPassed = applyManagerTrace(
      validationStarted,
      makeTrace([
        makeEvent(5, 'validation', {
          message: 'Validation passed cleanly',
        }),
      ]),
    );
    expect(validationPassed.nodes.find((item) => item.id === 'plan-2')?.status).toBe('completed');

    // Unplanned observed event that starts active sets currentNodeId to event-6
    const observedActive = applyManagerTrace(
      validationPassed,
      makeTrace([
        makeEvent(6, 'tool', {
          tool: 'inspect_preview',
          status: 'started',
          message: 'Inspecting preview',
        }),
      ]),
    );
    expect(observedActive.currentNodeId).toBe('event-6');
    expect(observedActive.nodes.find((item) => item.id === 'event-6')?.status).toBe('active');
  });

  it('handles terminal trace phases (finished, error) and missing-terminal-event outcomes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_500);

    const planned = applyManagerPlan(createRunningAgentActivity('Finish test', 1_000), basePlan);

    const withActiveFinished = applyManagerTrace(
      planned,
      makeTrace(
        [
          makeEvent(1, 'tool', { tool: 'read_file', status: 'started', message: 'Reading' }),
          makeEvent(2, 'finished', { message: 'All done' }),
        ],
        { outcome: 'success' },
      ),
    );
    expect(withActiveFinished.outcome).toBe('success');
    expect(withActiveFinished.currentPhase).toBe('result');
    expect(withActiveFinished.currentNodeId).toBeNull();
    expect(withActiveFinished.durationMs).toBe(1_500);
    expect(withActiveFinished.nodes.find((item) => item.id === 'plan-0')?.status).toBe('completed');
    expect(withActiveFinished.nodes.find((item) => item.id === 'result')).toMatchObject({
      status: 'completed',
      detail: 'All done',
    });

    const withErrorPhase = applyManagerTrace(
      planned,
      makeTrace(
        [
          makeEvent(1, 'tool', { tool: 'read_file', status: 'started', message: 'Reading' }),
          makeEvent(2, 'error', { message: '' }),
        ],
        { outcome: 'error', durationMs: 400 },
      ),
    );
    expect(withErrorPhase.outcome).toBe('error');
    expect(withErrorPhase.nodes.find((item) => item.id === 'plan-0')?.status).toBe('failed');
    expect(withErrorPhase.nodes.find((item) => item.id === 'result')).toMatchObject({
      status: 'failed',
      detail: 'Activity updated.',
    });

    // Terminal trace outcome without explicit finished/error event synthesizes finishAgentActivity
    const implicitSuccess = applyManagerTrace(
      planned,
      makeTrace([makeEvent(1, 'tool', { tool: 'read_file', status: 'completed' })], {
        outcome: 'success',
        endedAt: 2_000,
      }),
    );
    expect(implicitSuccess.outcome).toBe('success');
    expect(implicitSuccess.nodes.find((item) => item.id === 'result')).toMatchObject({
      status: 'completed',
      detail: 'Run completed.',
    });

    const implicitError = applyManagerTrace(
      planned,
      makeTrace([], { outcome: 'error', endedAt: 1_800 }),
    );
    expect(implicitError.outcome).toBe('error');
    expect(implicitError.nodes.find((item) => item.id === 'result')).toMatchObject({
      status: 'failed',
      detail: 'Run stopped before completion.',
    });

    // Aborted outcome overrides even if a finished event appeared earlier
    const abortedAfterFinished = applyManagerTrace(
      withActiveFinished,
      makeTrace([], { outcome: 'aborted', endedAt: 2_200 }),
    );
    expect(abortedAfterFinished.outcome).toBe('aborted');
    expect(abortedAfterFinished.nodes.find((item) => item.id === 'result')).toMatchObject({
      status: 'skipped',
      detail: 'Run stopped before completion.',
    });
  });

  it('appends recovery nodes for retry and fallback actions with or without result anchor', () => {
    const planned = applyManagerPlan(createRunningAgentActivity('Recover'), basePlan);
    const fallbackRecovery: WebLLMRecoveryEvent = {
      requestedModelId: 'model-a',
      modelId: 'model-b',
      phase: 'generation',
      action: 'fallback',
      reason: 'out-of-memory',
      attempt: 1,
    };
    const afterFirst = applyRecovery(planned, fallbackRecovery);
    const firstRecovery = afterFirst.nodes.find((item) => item.id === 'recovery-1');
    expect(firstRecovery).toMatchObject({
      phase: 'recovery',
      kind: 'recovery',
      label: 'Switch model',
      status: 'completed',
      detail: 'Recovered after out of memory; continuing with model-b.',
      provenance: 'recovery',
    });
    expect(afterFirst.nodes.at(-1)?.id).toBe('result');

    const retryRecovery: WebLLMRecoveryEvent = {
      requestedModelId: 'model-a',
      modelId: 'model-a',
      phase: 'initialization',
      action: 'retry',
      reason: 'worker-failure',
      attempt: 2,
    };
    const noResult = createIdleAgentActivity('No result');
    const afterNoResult = applyRecovery(noResult, retryRecovery);
    expect(afterNoResult.nodes[0]).toMatchObject({
      id: 'recovery-1',
      label: 'Recover model',
      detail: 'Recovered after worker failure; continuing with model-a.',
    });
  });

  it('finishes activity cleanly for success, aborted, error, blank detail, and zero startedAt', () => {
    const activity = applyManagerPlan(createRunningAgentActivity('Finish', 1_000), basePlan);
    const withActive: AgentActivityState = {
      ...activity,
      durationMs: 250,
      nodes: activity.nodes.map((item) =>
        item.id === 'plan-0' ? { ...item, status: 'active' } : item,
      ),
    };

    const succeeded = finishAgentActivity(withActive, 'success', '   ', 1_100);
    expect(succeeded.outcome).toBe('success');
    expect(succeeded.durationMs).toBe(250);
    expect(succeeded.nodes.find((item) => item.id === 'plan-0')?.status).toBe('completed');
    expect(succeeded.nodes.find((item) => item.id === 'plan-1')?.status).toBe('skipped');
    expect(succeeded.nodes.find((item) => item.id === 'result')).toMatchObject({
      status: 'completed',
      detail: 'Waiting for the run to finish.',
    });

    const errored = finishAgentActivity(withActive, 'error', 'Boom', 1_900);
    expect(errored.durationMs).toBe(900);
    expect(errored.nodes.find((item) => item.id === 'plan-0')?.status).toBe('failed');
    expect(errored.nodes.find((item) => item.id === 'result')).toMatchObject({
      status: 'failed',
      detail: 'Boom',
    });

    const aborted = finishAgentActivity(withActive, 'aborted', 'Cancelled');
    expect(aborted.nodes.find((item) => item.id === 'plan-0')?.status).toBe('skipped');
    expect(aborted.nodes.find((item) => item.id === 'result')?.status).toBe('skipped');

    const zeroStarted = finishAgentActivity(
      { ...createIdleAgentActivity('Zero'), durationMs: 0 },
      'success',
      'Done',
      5_000,
    );
    expect(zeroStarted.durationMs).toBe(0);
  });
});
