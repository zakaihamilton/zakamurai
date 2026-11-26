import { describe, expect, it } from 'vitest';
import {
  createIdleAgentActivity,
  createRunningAgentActivity,
  node,
} from '@/components/AI/Agent/AgentActivityNodes';
import { makeAgentSession } from '@/test-utils/agentSessionMocks';
import type { AgentActivityState, AgentReasoningEntry } from '@/types/domain-types';
import {
  extractReasoningLabel,
  getActivityRunStatus,
  getLiveExecutionInfo,
  getNextActivityNode,
  getProgressRoadmap,
  getReasoningEntryStatus,
  getReasoningGroupStatus,
  getRecentMilestones,
  getRunStatus,
  keyReasoningEntries,
  nodeDetail,
  normalizeReasoningViewType,
  parseGenerationProgress,
  type ReasoningGroup,
  statusLabels,
  stripReasoningLabel,
} from './AISectionReasoningUtils';

describe('AISectionReasoningUtils', () => {
  it('normalizes reasoning view types and generates unique render keys', () => {
    expect(normalizeReasoningViewType('text')).toBe('text');
    expect(normalizeReasoningViewType('activity')).toBe('activity');
    expect(normalizeReasoningViewType('visual')).toBe('visual');
    expect(normalizeReasoningViewType('unknown')).toBe('visual');
    expect(normalizeReasoningViewType(undefined)).toBe('visual');

    expect(keyReasoningEntries([])).toEqual([]);
    const entries: AgentReasoningEntry[] = [
      { text: 'Step A', timestamp: '10:00:00' },
      { text: 'Step A', timestamp: '10:00:00' },
      { text: 'Step B', timestamp: '10:00:01' },
      { text: 'Step A', timestamp: '10:00:00' },
    ];
    expect(keyReasoningEntries(entries).map((entry) => entry.renderKey)).toEqual([
      '10:00:00-Step A-0',
      '10:00:00-Step A-1',
      '10:00:01-Step B-0',
      '10:00:00-Step A-2',
    ]);
  });

  it('extracts and strips markdown reasoning labels', () => {
    expect(extractReasoningLabel('**Routing:** choosing a plan')).toBe('Routing');
    expect(extractReasoningLabel('**  Context  :** loaded')).toBe('Context');
    expect(extractReasoningLabel('**   :** blank label')).toBeNull();
    expect(extractReasoningLabel('Plain reasoning text')).toBeNull();

    expect(stripReasoningLabel('**Routing:**   choosing a plan  ')).toBe('choosing a plan');
    expect(stripReasoningLabel('  Plain reasoning text  ')).toBe('Plain reasoning text');
  });

  it('computes reasoning entry and group statuses by precedence', () => {
    expect(
      getReasoningEntryStatus({
        text: 'Build failed even though ready',
        isLast: true,
        isRunning: true,
      }),
    ).toBe('error');
    expect(
      getReasoningEntryStatus({ text: 'Run aborted by user', isLast: false, isRunning: false }),
    ).toBe('error');
    expect(
      getReasoningEntryStatus({ text: 'All checks passed', isLast: true, isRunning: true }),
    ).toBe('active');
    expect(
      getReasoningEntryStatus({ text: 'Validation passed', isLast: false, isRunning: true }),
    ).toBe('success');
    expect(getReasoningEntryStatus({ text: 'Reading files', isLast: true, isRunning: false })).toBe(
      'neutral',
    );

    const errorGroup: ReasoningGroup = {
      step: 1,
      entries: [
        { text: 'Completed setup', timestamp: '10:00:00' },
        { text: 'Could not read file', timestamp: '10:00:01' },
      ],
    };
    expect(getReasoningGroupStatus(errorGroup, true, true)).toBe('error');

    const activeGroup: ReasoningGroup = {
      step: 2,
      entries: [
        { text: 'Completed setup', timestamp: '10:00:00' },
        { text: 'Working now', timestamp: '10:00:01' },
      ],
    };
    expect(getReasoningGroupStatus(activeGroup, true, true)).toBe('active');
    expect(getReasoningGroupStatus(activeGroup, false, true)).toBe('success');

    const neutralGroup: ReasoningGroup = {
      step: null,
      entries: [{ text: 'Thinking', timestamp: '10:00:00' }],
    };
    expect(getReasoningGroupStatus(neutralGroup, true, false)).toBe('neutral');
    expect(getReasoningGroupStatus({ step: null, entries: [] }, true, true)).toBe('neutral');
  });

  it('computes legacy run status and activity-aware display run status', () => {
    expect(getRunStatus(null, 'Network error', false)).toBe('error');
    expect(getRunStatus(makeAgentSession({ status: 'error' }), '', false)).toBe('error');
    expect(getRunStatus(makeAgentSession({ status: 'running' }), '', false)).toBe('running');
    expect(getRunStatus(makeAgentSession({ status: 'idle' }), '', true)).toBe('ready');
    expect(getRunStatus(null, '', false)).toBe('waiting');

    const idle = createIdleAgentActivity();
    const running = createRunningAgentActivity('Do work');
    const aborted: AgentActivityState = { ...idle, outcome: 'aborted' };
    const success: AgentActivityState = { ...idle, outcome: 'success' };
    const errored: AgentActivityState = { ...idle, outcome: 'error' };

    expect(getActivityRunStatus(errored, null, '', false)).toBe('error');
    expect(getActivityRunStatus(idle, null, 'Failure', false)).toBe('error');
    expect(getActivityRunStatus(idle, makeAgentSession({ status: 'error' }), '', false)).toBe(
      'error',
    );
    expect(getActivityRunStatus(aborted, null, '', true)).toBe('stopped');
    expect(getActivityRunStatus(running, null, '', false)).toBe('running');
    expect(
      getActivityRunStatus(undefined, makeAgentSession({ status: 'running' }), '', false),
    ).toBe('running');
    expect(getActivityRunStatus(success, null, '', false)).toBe('ready');
    expect(getActivityRunStatus(idle, null, '', true)).toBe('ready');
    expect(getActivityRunStatus(undefined, null, '', false)).toBe('waiting');
  });

  it('formats node details and parses generation progress', () => {
    expect(statusLabels).toEqual({
      queued: 'Up next',
      active: 'Working',
      completed: 'Done',
      failed: 'Blocked',
      skipped: 'Skipped',
    });

    expect(
      nodeDetail(
        node({
          id: '1',
          phase: 'work',
          kind: 'tool',
          label: 'Read',
          status: 'queued',
          detail: 'Up next: Read app.tsx',
          reason: 'Read app.tsx',
        }),
      ),
    ).toBe('Up next: Read app.tsx');

    expect(
      nodeDetail(
        node({
          id: '2',
          phase: 'work',
          kind: 'tool',
          label: 'Read',
          status: 'active',
          detail: 'Up next: Read app.tsx',
          reason: 'Read app.tsx',
        }),
      ),
    ).toBe('Reason: Read app.tsx');

    expect(
      nodeDetail(
        node({
          id: '3',
          phase: 'work',
          kind: 'tool',
          label: 'Read',
          status: 'completed',
          detail: 'Up next: Inspect file',
        }),
      ),
    ).toBe('Inspect file');

    expect(
      nodeDetail(
        node({
          id: '4',
          phase: 'work',
          kind: 'tool',
          label: 'Read',
          status: 'failed',
          reason: 'Missing path',
        }),
      ),
    ).toBe('Missing path');

    expect(
      nodeDetail(
        node({
          id: '5',
          phase: 'work',
          kind: 'tool',
          label: 'Read',
          status: 'skipped',
        }),
      ),
    ).toBe('Skipped');

    expect(
      parseGenerationProgress(
        'Local model is responding — streaming its next action (2,718 character(s) received). Waiting for complete source code before validation…',
      ),
    ).toEqual({
      characterCount: 2718,
      waitingLabel: 'Waiting for complete source',
    });

    expect(
      parseGenerationProgress(
        '42 character(s) received; waiting for   valid   JSON... before validation',
      ),
    ).toEqual({
      characterCount: 42,
      waitingLabel: 'Waiting for valid JSON',
    });

    expect(parseGenerationProgress('Preparing output')).toEqual({
      characterCount: null,
      waitingLabel: 'Waiting for output to finish',
    });
  });

  it('builds live execution info across outcome and detail-matching cases', () => {
    const running = createRunningAgentActivity('Build UI');
    expect(getLiveExecutionInfo(running)).toEqual({
      title: 'Route',
      detail: 'Preparing the execution route…',
      outcome: 'Executing route',
      badge: 'In progress',
      tone: 'running',
    });

    const sameAsTitle: AgentActivityState = {
      ...running,
      currentNodeId: 'same',
      nodes: [
        node({
          id: 'same',
          phase: 'work',
          kind: 'tool',
          label: 'Validate',
          status: 'active',
          detail: 'Validate',
        }),
      ],
    };
    expect(getLiveExecutionInfo(sameAsTitle).detail).toBe('');

    const sameAsOutcome: AgentActivityState = {
      ...running,
      outcome: 'idle',
      currentNodeId: 'idle-node',
      nodes: [
        node({
          id: 'idle-node',
          phase: 'work',
          kind: 'milestone',
          label: 'Step',
          status: 'active',
          detail: 'Waiting to start',
        }),
      ],
    };
    expect(getLiveExecutionInfo(sameAsOutcome)).toEqual({
      title: 'Step',
      detail: '',
      outcome: 'Waiting to start',
      badge: 'Waiting',
      tone: 'idle',
    });

    expect(getLiveExecutionInfo({ ...createIdleAgentActivity(), outcome: 'aborted' })).toEqual({
      title: 'Run stopped',
      detail: '',
      outcome: 'Run stopped',
      badge: 'Stopped',
      tone: 'aborted',
    });
    expect(getLiveExecutionInfo({ ...createIdleAgentActivity(), outcome: 'error' })).toMatchObject({
      title: 'Route stopped',
      badge: 'Stopped',
      tone: 'error',
    });
    expect(
      getLiveExecutionInfo({ ...createIdleAgentActivity(), outcome: 'success' }),
    ).toMatchObject({
      title: 'Route complete',
      badge: 'Complete',
      tone: 'success',
    });
  });

  it('computes progress roadmap stage statuses across all lifecycle branches', () => {
    // Active running with validation skipped when current phase is result and no validation nodes exist
    const runningResult: AgentActivityState = {
      ...createRunningAgentActivity('Ship'),
      currentPhase: 'result',
      currentNodeId: 'result',
      nodes: [
        node({
          id: 'request',
          phase: 'request',
          kind: 'request',
          label: 'Req',
          status: 'completed',
        }),
        node({
          id: 'context',
          phase: 'context',
          kind: 'milestone',
          label: 'Ctx',
          status: 'completed',
        }),
        node({ id: 'plan-0', phase: 'work', kind: 'tool', label: 'Work', status: 'completed' }),
        node({ id: 'result', phase: 'result', kind: 'result', label: 'Res', status: 'active' }),
      ],
    };
    expect(getProgressRoadmap(runningResult).map((s) => [s.id, s.status])).toEqual([
      ['request', 'completed'],
      ['context', 'completed'],
      ['work', 'completed'],
      ['validation', 'skipped'],
      ['result', 'active'],
    ]);

    // Failed attempt + queued retry stays upcoming; all-skipped stage becomes skipped; terminal infers prior stages
    const complex: AgentActivityState = {
      ...createIdleAgentActivity('Complex'),
      outcome: 'error',
      currentPhase: 'validation',
      nodes: [
        node({ id: 'ctx', phase: 'context', kind: 'milestone', label: 'Ctx', status: 'skipped' }),
        node({ id: 'w1', phase: 'work', kind: 'tool', label: 'W1', status: 'completed' }),
        node({ id: 'w2', phase: 'work', kind: 'tool', label: 'W2', status: 'queued' }),
        node({ id: 'v1', phase: 'validation', kind: 'validation', label: 'Val', status: 'failed' }),
      ],
    };
    expect(getProgressRoadmap(complex).map((s) => [s.id, s.status])).toEqual([
      ['request', 'skipped'],
      ['context', 'skipped'],
      ['work', 'upcoming'],
      ['validation', 'failed'],
      ['result', 'failed'],
    ]);

    // Running using activeNode phase fallback when currentPhase is null
    const inferredPhaseRunning: AgentActivityState = {
      ...createIdleAgentActivity('Inferred'),
      outcome: 'running',
      currentPhase: null,
      currentNodeId: null,
      nodes: [
        node({ id: 'w', phase: 'recovery', kind: 'recovery', label: 'Rec', status: 'active' }),
      ],
    };
    expect(getProgressRoadmap(inferredPhaseRunning).map((s) => [s.id, s.status])).toEqual([
      ['request', 'upcoming'],
      ['context', 'upcoming'],
      ['work', 'active'],
      ['validation', 'skipped'],
      ['result', 'upcoming'],
    ]);

    // Terminal success / aborted with no nodes
    expect(
      getProgressRoadmap({ ...createIdleAgentActivity(), outcome: 'success' }).at(-1)?.status,
    ).toBe('completed');
    expect(
      getProgressRoadmap({ ...createIdleAgentActivity(), outcome: 'aborted' }).at(-1)?.status,
    ).toBe('skipped');

    // Aborted with explicitly skipped node in a stage
    const abortedWithSkipped: AgentActivityState = {
      ...createIdleAgentActivity(),
      outcome: 'aborted',
      nodes: [node({ id: 'w', phase: 'work', kind: 'tool', label: 'Work', status: 'skipped' })],
    };
    expect(getProgressRoadmap(abortedWithSkipped).find((s) => s.id === 'work')?.status).toBe(
      'skipped',
    );

    // Terminal with currentPhase later than empty and populated earlier stages
    const terminalSkippedRequest: AgentActivityState = {
      ...createIdleAgentActivity(),
      outcome: 'success',
      currentPhase: 'work',
      nodes: [
        node({ id: 'ctx', phase: 'context', kind: 'milestone', label: 'Ctx', status: 'completed' }),
      ],
    };
    expect(getProgressRoadmap(terminalSkippedRequest).map((s) => [s.id, s.status])).toEqual([
      ['request', 'skipped'],
      ['context', 'completed'],
      ['work', 'upcoming'],
      ['validation', 'upcoming'],
      ['result', 'completed'],
    ]);
  });

  it('finds the next activity node and recent milestones', () => {
    expect(getNextActivityNode(createIdleAgentActivity())).toBeUndefined();

    // No current stage index -> returns first non-request queued node
    const noStage: AgentActivityState = {
      ...createIdleAgentActivity('Next'),
      outcome: 'running',
      currentPhase: null,
      currentNodeId: null,
      nodes: [
        node({ id: 'req', phase: 'request', kind: 'request', label: 'Req', status: 'queued' }),
        node({ id: 'ctx', phase: 'context', kind: 'milestone', label: 'Ctx', status: 'queued' }),
      ],
    };
    expect(getNextActivityNode(noStage)?.id).toBe('ctx');

    // Prefers same-stage queued node over later-stage queued node
    const sameStage: AgentActivityState = {
      ...noStage,
      currentPhase: 'work',
      nodes: [
        node({
          id: 'val',
          phase: 'validation',
          kind: 'validation',
          label: 'Val',
          status: 'queued',
        }),
        node({ id: 'w', phase: 'work', kind: 'tool', label: 'Work', status: 'queued' }),
      ],
    };
    expect(getNextActivityNode(sameStage)?.id).toBe('w');

    // Prefers later-stage queued node over earlier-stage queued node
    const laterStage: AgentActivityState = {
      ...noStage,
      currentPhase: 'context',
      nodes: [
        node({ id: 'r', phase: 'routing', kind: 'milestone', label: 'Route', status: 'queued' }),
        node({
          id: 'val',
          phase: 'validation',
          kind: 'validation',
          label: 'Val',
          status: 'queued',
        }),
      ],
    };
    expect(getNextActivityNode(laterStage)?.id).toBe('val');

    // Falls back to queuedNodes[0] when only earlier stages remain queued
    const earlierOnly: AgentActivityState = {
      ...noStage,
      currentPhase: 'result',
      nodes: [
        node({ id: 'ctx', phase: 'context', kind: 'milestone', label: 'Ctx', status: 'queued' }),
      ],
    };
    expect(getNextActivityNode(earlierOnly)?.id).toBe('ctx');

    // Recent milestones exclude request, routing, result, non-completed, and duplicates
    const milestonesActivity: AgentActivityState = {
      ...createIdleAgentActivity('Milestones'),
      nodes: [
        node({ id: 'req', phase: 'request', kind: 'request', label: 'Req', status: 'completed' }),
        node({
          id: 'route',
          phase: 'routing',
          kind: 'milestone',
          label: 'Route',
          status: 'completed',
        }),
        node({
          id: 'c1',
          phase: 'context',
          kind: 'milestone',
          label: 'Ctx',
          status: 'completed',
          detail: 'D1',
        }),
        node({
          id: 'w1',
          phase: 'work',
          kind: 'tool',
          label: 'Read',
          status: 'completed',
          detail: 'Same',
        }),
        node({
          id: 'w2',
          phase: 'work',
          kind: 'tool',
          label: 'Read',
          status: 'completed',
          detail: 'Same',
        }),
        node({
          id: 'w3',
          phase: 'work',
          kind: 'tool',
          label: 'Write',
          status: 'failed',
          detail: 'Err',
        }),
        node({
          id: 'v1',
          phase: 'validation',
          kind: 'validation',
          label: 'Val',
          status: 'completed',
          detail: 'OK',
        }),
        node({ id: 'res', phase: 'result', kind: 'result', label: 'Res', status: 'completed' }),
      ],
    };
    expect(getRecentMilestones(milestonesActivity).map((item) => item.id)).toEqual([
      'v1',
      'w2',
      'c1',
    ]);
    expect(getRecentMilestones(milestonesActivity, 2).map((item) => item.id)).toEqual(['v1', 'w2']);
  });
});
