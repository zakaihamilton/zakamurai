import type { ManagerPlan } from '@/components/AI/types';
import type { AgentActivityState } from '@/types/domain-types';
import {
  applyManagerPlan,
  applyManagerTrace,
  applyReasoningFallback,
  applyRecovery,
  createRunningAgentActivity,
  finishAgentActivity,
  normalizeAgentActivity,
} from './AgentActivity';
import type { ManagerTrace } from './ManagerTrace';
import { describe, expect, it } from 'vitest';

const plan: ManagerPlan = {
  intent: 'edit',
  modelRequired: true,
  confidence: 'high',
  steps: [
    { kind: 'tool', tool: 'read_file', reason: 'Inspect the existing implementation.' },
    { kind: 'model', task: 'generate-changes', reason: 'Produce the requested update.' },
    { kind: 'tool', tool: 'validate', reason: 'Check the result before presenting it.' },
  ],
};

const traceWith = (
  events: ManagerTrace['events'],
  outcome: ManagerTrace['outcome'] = 'running',
): ManagerTrace => ({
  version: 1,
  runId: 'run-1',
  request: 'Build the feature',
  startedAt: 1_000,
  durationMs: 250,
  outcome,
  plan,
  events,
});

const event = (
  sequence: number,
  phase: ManagerTrace['events'][number]['phase'],
  patch: Partial<ManagerTrace['events'][number]> = {},
): ManagerTrace['events'][number] => ({
  sequence,
  elapsedMs: sequence * 25,
  phase,
  turn: sequence,
  ...patch,
});

describe('AgentActivity', () => {
  it('creates a bounded execution route from a manager plan', () => {
    const activity = applyManagerPlan(createRunningAgentActivity('Build the feature'), plan);

    expect(activity.nodes.map((item) => item.label)).toEqual([
      'Request',
      'Route',
      'Gather context',
      'Read source',
      'Generate changes',
      'Validate changes',
      'Ready',
    ]);
    expect(activity.nodes.slice(2, -1).every((item) => item.status === 'queued')).toBe(true);
    expect(activity.nodes.find((item) => item.id === 'route')?.status).toBe('completed');
  });

  it('transitions planned nodes as trace events arrive', () => {
    let activity = createRunningAgentActivity('Build the feature');
    activity = applyManagerTrace(
      activity,
      traceWith([
        event(1, 'routing', { message: 'Editing route selected.' }),
        event(2, 'context', { message: 'Context collection started.' }),
        event(3, 'tool', { tool: 'read_file', status: 'started', message: 'Reading source.' }),
      ]),
    );
    expect(activity.currentNodeId).toBe('plan-0');
    expect(activity.nodes.find((item) => item.id === 'plan-0')?.status).toBe('active');

    activity = applyManagerTrace(
      activity,
      traceWith(
        [
          event(1, 'routing', { message: 'Editing route selected.' }),
          event(2, 'context', { message: 'Context collection started.' }),
          event(3, 'tool', { tool: 'read_file', status: 'started', message: 'Reading source.' }),
          event(4, 'tool', {
            tool: 'read_file',
            status: 'completed',
            output: 'Source loaded.',
            message: 'Source loaded.',
          }),
          event(5, 'model', {
            task: 'generate-changes',
            status: 'started',
            message: 'Generating changes.',
          }),
          event(6, 'validation', {
            status: 'started',
            message: 'Validation started.',
          }),
          event(7, 'validation', {
            status: 'completed',
            output: 'All checks passed.',
            message: 'Validation passed.',
          }),
          event(8, 'finished', { status: 'completed', message: 'Ready for review.' }),
        ],
        'success',
      ),
    );

    expect(activity.outcome).toBe('success');
    expect(activity.currentNodeId).toBeNull();
    expect(activity.nodes.find((item) => item.id === 'plan-0')?.status).toBe('completed');
    expect(activity.nodes.find((item) => item.id === 'plan-1')?.status).toBe('completed');
    expect(activity.nodes.find((item) => item.id === 'plan-2')?.status).toBe('completed');
    expect(activity.nodes.find((item) => item.id === 'result')?.status).toBe('completed');
  });

  it('adds recovery nodes without losing the active work node', () => {
    const activity = applyManagerPlan(createRunningAgentActivity('Answer this'), {
      intent: 'explanation',
      modelRequired: true,
      confidence: 'high',
      steps: [{ kind: 'model', task: 'answer', reason: 'Compose an answer.' }],
    });
    const active = applyManagerTrace(
      activity,
      traceWith([event(1, 'model', { task: 'answer', status: 'started' })]),
    );
    const recovered = applyRecovery(active, {
      requestedModelId: 'primary-model',
      action: 'fallback',
      reason: 'invalid-context',
      modelId: 'fallback-model',
      phase: 'generation',
      attempt: 1,
    });

    expect(recovered.currentNodeId).toBe('plan-0');
    expect(recovered.nodes.some((item) => item.kind === 'recovery')).toBe(true);
  });

  it('represents errors and aborted runs explicitly', () => {
    const running = createRunningAgentActivity('Run it');
    const failed = finishAgentActivity(running, 'error', 'The model failed to respond.', 1_800);
    const aborted = finishAgentActivity(running, 'aborted', 'The run was stopped.', 1_500);

    expect(failed.outcome).toBe('error');
    expect(failed.nodes.find((item) => item.id === 'result')?.status).toBe('failed');
    expect(aborted.outcome).toBe('aborted');
    expect(aborted.nodes.every((item) => item.status !== 'active')).toBe(true);
    expect(aborted.nodes.find((item) => item.id === 'result')?.status).toBe('skipped');
  });

  it('falls back to observed legacy reasoning when no plan was persisted', () => {
    const activity = applyReasoningFallback(
      'Inspect the app',
      [
        { text: '**Routing:** selecting a path', timestamp: '10:00:00' },
        { text: '**Validation:** failed to build', timestamp: '10:00:01' },
      ],
      'error',
    );

    expect(activity.nodes.some((item) => item.label === 'Observed run')).toBe(true);
    expect(activity.nodes.some((item) => item.status === 'failed')).toBe(true);
    expect(activity.outcome).toBe('error');
  });

  it('returns an idle state for empty legacy history and normalizes malformed data', () => {
    expect(applyReasoningFallback('Nothing yet', [], 'idle').nodes).toHaveLength(0);

    const normalized = normalizeAgentActivity({
      outcome: 'not-real',
      nodes: [{ id: 'x', phase: 'not-real', kind: 'not-real', status: 'not-real', label: 1 }],
    });

    expect(normalized?.outcome).toBe('idle');
    expect(normalized?.nodes[0]).toMatchObject({
      id: 'x',
      phase: 'work',
      kind: 'milestone',
      status: 'queued',
      label: 'Activity',
    });
  });

  it('caps activity while retaining the request and latest observed nodes', () => {
    let activity: AgentActivityState = createRunningAgentActivity('Keep the request');
    const events = Array.from({ length: 110 }, (_, index) =>
      event(index + 1, 'model', {
        task: 'answer',
        status: 'completed',
        output: `Response ${index}`,
      }),
    );
    activity = applyManagerTrace(activity, traceWith(events));

    expect(activity.nodes.length).toBeLessThanOrEqual(96);
    expect(activity.nodes[0]?.id).toBe('request');
    expect(activity.nodes.some((item) => item.id === 'event-110')).toBe(true);
    expect(activity.nodes.at(-1)?.id).toBe('result');
  });
});
