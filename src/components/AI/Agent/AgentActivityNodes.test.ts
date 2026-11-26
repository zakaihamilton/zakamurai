import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ManagerEvent, ManagerStep } from '@/components/AI/types';
import type { AgentActivityNode, AgentActivityState } from '@/types/domain-types';
import {
  activateNode,
  appendObservedNode,
  capNodes,
  clip,
  createIdleAgentActivity,
  createRunningAgentActivity,
  detailForEvent,
  elapsedLabel,
  eventStatus,
  findPlannedNode,
  getStepNode,
  MAX_AGENT_ACTIVITY_DETAIL_CHARACTERS,
  MAX_AGENT_ACTIVITY_NODES,
  mergeNode,
  node,
  phaseForEvent,
  timestamp,
  withUpdatedNode,
} from './AgentActivityNodes';
import type { ManagerTraceEvent } from './ManagerTrace';

const makeTraceEvent = (
  sequence: number,
  phase: ManagerTraceEvent['phase'],
  patch: Partial<ManagerTraceEvent> = {},
): ManagerTraceEvent => ({
  sequence,
  elapsedMs: sequence * 100,
  phase,
  turn: sequence,
  ...patch,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AgentActivityNodes', () => {
  it('clips nullish, padded, and oversized text with default and custom limits', () => {
    expect(MAX_AGENT_ACTIVITY_NODES).toBe(96);
    expect(MAX_AGENT_ACTIVITY_DETAIL_CHARACTERS).toBe(1200);
    expect(clip(undefined)).toBe('');
    expect(clip(null)).toBe('');
    expect(clip('   hello world   ')).toBe('hello world');
    expect(clip('abcdef', 6)).toBe('abcdef');
    expect(clip('abcdefg', 6)).toBe('abcdef…');

    const longText = 'x'.repeat(MAX_AGENT_ACTIVITY_DETAIL_CHARACTERS + 10);
    expect(clip(longText)).toBe(`${'x'.repeat(MAX_AGENT_ACTIVITY_DETAIL_CHARACTERS)}…`);
  });

  it('formats timestamps and elapsed millisecond labels across edge cases', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 9, 5, 7, 42));
    expect(timestamp()).toBe('09:05:07.042');

    expect(elapsedLabel(undefined)).toBe('');
    expect(elapsedLabel(Number.NaN)).toBe('');
    expect(elapsedLabel(Number.POSITIVE_INFINITY)).toBe('');
    expect(elapsedLabel(0)).toBe('');
    expect(elapsedLabel(-250)).toBe('');
    expect(elapsedLabel(5)).toBe('+0m 00.005s');
    expect(elapsedLabel(1250.9)).toBe('+0m 01.250s');
    expect(elapsedLabel(65_004)).toBe('+1m 05.004s');
  });

  it('caps node lists while preserving the initial request node and newest tail', () => {
    const underLimit: AgentActivityNode[] = Array.from({ length: 5 }, (_, index) =>
      node({
        id: `n-${index}`,
        phase: 'work',
        kind: 'tool',
        label: `Node ${index}`,
        status: 'completed',
      }),
    );
    expect(capNodes(underLimit)).toBe(underLimit);

    const overLimit: AgentActivityNode[] = Array.from(
      { length: MAX_AGENT_ACTIVITY_NODES + 10 },
      (_, index) =>
        node({
          id: `n-${index}`,
          phase: 'work',
          kind: 'tool',
          label: `Node ${index}`,
          status: 'completed',
        }),
    );
    const capped = capNodes(overLimit);
    expect(capped).toHaveLength(MAX_AGENT_ACTIVITY_NODES);
    expect(capped[0]?.id).toBe('n-0');
    expect(capped[1]?.id).toBe('n-11');
    expect(capped.at(-1)?.id).toBe(`n-${MAX_AGENT_ACTIVITY_NODES + 9}`);
  });

  it('builds nodes with optional fields, zero values, and label clipping', () => {
    const minimal = node({
      id: 'min',
      phase: 'work',
      kind: 'milestone',
      label: 'L'.repeat(185),
      status: 'queued',
    });
    expect(minimal.label).toBe(`${'L'.repeat(180)}…`);
    expect(minimal.detail).toBe('');
    expect(minimal.timestamp).toBe('');
    expect('reason' in minimal).toBe(false);
    expect('turn' in minimal).toBe(false);
    expect('elapsedMs' in minimal).toBe(false);

    const full = node({
      id: 'full',
      phase: 'work',
      kind: 'tool',
      label: 'Read source',
      status: 'completed',
      detail: 'Loaded file',
      reason: 'Need context',
      tool: 'read_file',
      task: 'answer',
      turn: 0,
      elapsedMs: 0,
      timestamp: '10:00:00.000',
      input: 'src/app.ts',
      output: 'export const x = 1;',
      provenance: 'model',
    });
    expect(full).toMatchObject({
      turn: 0,
      elapsedMs: 0,
      reason: 'Need context',
      tool: 'read_file',
      task: 'answer',
      input: 'src/app.ts',
      output: 'export const x = 1;',
      provenance: 'model',
    });
  });

  it('creates idle and running agent activity states', () => {
    const idleDefault = createIdleAgentActivity();
    expect(idleDefault).toEqual({
      runId: null,
      request: '',
      outcome: 'idle',
      currentPhase: null,
      currentNodeId: null,
      startedAt: 0,
      durationMs: 0,
      lastTraceSequence: 0,
      nodes: [],
    });

    const idleWithReq = createIdleAgentActivity('  Inspect project  ');
    expect(idleWithReq.request).toBe('Inspect project');

    const runningBlank = createRunningAgentActivity('   ', 5_000);
    expect(runningBlank.startedAt).toBe(5_000);
    expect(runningBlank.outcome).toBe('running');
    expect(runningBlank.currentPhase).toBe('routing');
    expect(runningBlank.currentNodeId).toBe('route');
    expect(runningBlank.nodes.map((item) => item.id)).toEqual([
      'request',
      'route',
      'context',
      'result',
    ]);
    expect(runningBlank.nodes[0]?.detail).toBe('User request received.');

    const runningWithReq = createRunningAgentActivity('Fix bug', 6_000);
    expect(runningWithReq.nodes[0]?.detail).toBe('Fix bug');
  });

  it('maps planned tool and model steps to queued nodes with label fallbacks', () => {
    const validateNode = getStepNode({ kind: 'tool', tool: 'validate', reason: 'Verify build' }, 0);
    expect(validateNode).toMatchObject({
      id: 'plan-0',
      phase: 'validation',
      kind: 'validation',
      label: 'Validate changes',
      status: 'queued',
      detail: 'Up next: Verify build',
      reason: 'Verify build',
      tool: 'validate',
    });

    const knownTool = getStepNode({ kind: 'tool', tool: 'read_file', reason: 'Inspect code' }, 1);
    expect(knownTool).toMatchObject({
      id: 'plan-1',
      phase: 'work',
      kind: 'tool',
      label: 'Read source',
    });

    const unknownTool = getStepNode(
      {
        kind: 'tool',
        tool: 'custom_tool' as ManagerStep extends { kind: 'tool'; tool: infer T } ? T : never,
        reason: 'Run custom',
      },
      2,
    );
    expect(unknownTool.label).toBe('custom_tool');

    const answerStep = getStepNode({ kind: 'model', task: 'answer', reason: 'Explain' }, 3);
    expect(answerStep).toMatchObject({
      kind: 'model',
      label: 'Compose answer',
      task: 'answer',
    });

    const repairStep = getStepNode(
      { kind: 'model', task: 'repair-changes', reason: 'Fix errors' },
      4,
    );
    expect(repairStep.label).toBe('Repair changes');

    const unknownModelStep = getStepNode(
      {
        kind: 'model',
        task: 'custom-task' as Extract<ManagerStep, { kind: 'model' }>['task'],
        reason: 'Fallback task',
      },
      5,
    );
    expect(unknownModelStep.label).toBe('Work with model');
  });

  it('merges existing nodes with fresh plan nodes accurately', () => {
    const fresh = node({
      id: 'route',
      phase: 'routing',
      kind: 'milestone',
      label: 'Route',
      status: 'completed',
      detail: 'Request routed to edit.',
    });
    expect(mergeNode(undefined, fresh)).toBe(fresh);

    const existingActiveRoute = node({
      id: 'route',
      phase: 'routing',
      kind: 'milestone',
      label: 'Route',
      status: 'active',
      detail: 'Preparing the execution route…',
    });
    const mergedRoute = mergeNode(existingActiveRoute, fresh);
    expect(mergedRoute.status).toBe('completed');
    expect(mergedRoute.detail).toBe('Request routed to edit.');

    const existingPlaceholderContext = node({
      id: 'context',
      phase: 'context',
      kind: 'milestone',
      label: 'Gather context',
      status: 'active',
      detail: 'Workspace context will be gathered before work begins.',
    });
    const nextContext = node({
      id: 'context',
      phase: 'context',
      kind: 'milestone',
      label: 'Gather context',
      status: 'queued',
      detail: 'New plan detail',
    });
    const mergedContext = mergeNode(existingPlaceholderContext, nextContext);
    expect(mergedContext.status).toBe('active');
    expect(mergedContext.detail).toBe('Workspace context will be gathered before work begins.');

    const existingCompletedResult = node({
      id: 'result',
      phase: 'result',
      kind: 'result',
      label: 'Ready',
      status: 'completed',
      detail: 'Previously finished.',
    });
    const nextResult = node({
      id: 'result',
      phase: 'result',
      kind: 'result',
      label: 'Ready',
      status: 'queued',
      detail: 'Updated plan result detail',
    });
    const mergedResult = mergeNode(existingCompletedResult, nextResult);
    expect(mergedResult.status).toBe('completed');
    expect(mergedResult.detail).toBe('Updated plan result detail');
  });

  it('derives event details, phases, planned node matches, and status', () => {
    const msgEvent: ManagerEvent = { type: 'tool', turn: 1, message: '  Custom msg  ' };
    expect(detailForEvent(msgEvent)).toBe('Custom msg');
    expect(detailForEvent({ type: 'tool', turn: 1, tool: 'list_files' })).toBe(
      'List workspace updated.',
    );
    expect(
      detailForEvent({
        type: 'tool',
        turn: 1,
        tool: 'unknown_tool' as ManagerEvent['tool'],
      }),
    ).toBe('unknown_tool updated.');
    expect(detailForEvent({ type: 'model', turn: 1, action: 'finish' })).toBe('finish updated.');
    expect(
      detailForEvent({
        type: 'tool',
        turn: 1,
        action: { action: 'read_file', path: 'a.ts' },
      }),
    ).toBe('read_file updated.');
    expect(
      detailForEvent({
        type: 'tool',
        turn: 1,
        action: {} as ManagerEvent['action'],
      }),
    ).toBe('Activity updated.');
    expect(detailForEvent({ type: 'routing', turn: 1 })).toBe('Activity updated.');

    expect(phaseForEvent('routing')).toBe('routing');
    expect(phaseForEvent('context')).toBe('context');
    expect(phaseForEvent('validation')).toBe('validation');
    expect(phaseForEvent('finished')).toBe('result');
    expect(phaseForEvent('error')).toBe('result');
    expect(phaseForEvent('tool')).toBe('work');
    expect(phaseForEvent('model')).toBe('work');

    const activity: AgentActivityState = {
      ...createRunningAgentActivity('Test'),
      nodes: [
        node({
          id: 'context',
          phase: 'context',
          kind: 'milestone',
          label: 'Ctx',
          status: 'queued',
        }),
        node({
          id: 'plan-done',
          phase: 'work',
          kind: 'tool',
          label: 'Done read',
          status: 'completed',
          tool: 'read_file',
        }),
        node({
          id: 'plan-read',
          phase: 'work',
          kind: 'tool',
          label: 'Queued read',
          status: 'queued',
          tool: 'read_file',
        }),
        node({
          id: 'plan-model',
          phase: 'work',
          kind: 'model',
          label: 'Generate',
          status: 'active',
          task: 'generate-changes',
        }),
        node({
          id: 'plan-val',
          phase: 'validation',
          kind: 'validation',
          label: 'Validate',
          status: 'queued',
        }),
      ],
    };

    expect(findPlannedNode(activity, makeTraceEvent(1, 'tool', { tool: 'read_file' }))?.id).toBe(
      'plan-read',
    );
    expect(
      findPlannedNode(activity, makeTraceEvent(2, 'model', { task: 'generate-changes' }))?.id,
    ).toBe('plan-model');
    expect(findPlannedNode(activity, makeTraceEvent(3, 'context'))?.id).toBe('context');
    expect(
      findPlannedNode(activity, makeTraceEvent(4, 'context', { tool: 'list_files' })),
    ).toBeUndefined();
    expect(findPlannedNode(activity, makeTraceEvent(5, 'validation'))?.id).toBe('plan-val');
    expect(
      findPlannedNode(activity, makeTraceEvent(6, 'tool', { tool: 'inspect_preview' })),
    ).toBeUndefined();

    expect(eventStatus(makeTraceEvent(1, 'tool', { status: 'failed' }))).toBe('failed');
    expect(eventStatus(makeTraceEvent(1, 'tool', { errorCode: 'tool' }))).toBe('failed');
    expect(eventStatus(makeTraceEvent(1, 'model', { protocolStatus: 'invalid' }))).toBe('failed');
    expect(eventStatus(makeTraceEvent(1, 'validation', { message: 'Could not compile' }))).toBe(
      'failed',
    );
    expect(eventStatus(makeTraceEvent(1, 'tool', { output: 'Unexpected failure occurred' }))).toBe(
      'failed',
    );
    expect(eventStatus(makeTraceEvent(1, 'tool', { status: 'completed', output: 'OK' }))).toBe(
      'completed',
    );
  });

  it('updates, activates, and appends observed nodes with and without a result anchor', () => {
    const base = createRunningAgentActivity('Update nodes');
    const patched = withUpdatedNode(base, 'context', {
      status: 'completed',
      detail: 'Context ready',
    });
    expect(patched.nodes.find((item) => item.id === 'context')?.detail).toBe('Context ready');
    expect(patched.nodes.find((item) => item.id === 'route')?.status).toBe('active');

    const activated = activateNode(patched, 'result', 'result');
    expect(activated.currentPhase).toBe('result');
    expect(activated.currentNodeId).toBe('result');
    expect(activated.nodes.find((item) => item.id === 'route')?.status).toBe('completed');
    expect(activated.nodes.find((item) => item.id === 'result')?.status).toBe('active');

    const withObserved = appendObservedNode(
      base,
      makeTraceEvent(1, 'tool', {
        tool: 'search_workspace',
        message: 'Searching files',
        input: 'query',
        output: 'hits',
        provenance: 'model',
      }),
      'completed',
    );
    expect(withObserved.nodes.at(-2)?.id).toBe('event-1');
    expect(withObserved.nodes.at(-1)?.id).toBe('result');
    expect(withObserved.nodes.at(-2)).toMatchObject({
      kind: 'tool',
      label: 'Search workspace',
      timestamp: '+0m 00.100s',
    });

    const noResultBase: AgentActivityState = { ...createIdleAgentActivity('No result'), nodes: [] };
    const appendedPhases = [
      appendObservedNode(noResultBase, makeTraceEvent(1, 'tool'), 'active').nodes[0],
      appendObservedNode(
        noResultBase,
        makeTraceEvent(2, 'tool', { tool: 'custom' as ManagerTraceEvent['tool'] }),
        'completed',
      ).nodes[0],
      appendObservedNode(noResultBase, makeTraceEvent(3, 'model', { task: 'answer' }), 'completed')
        .nodes[0],
      appendObservedNode(noResultBase, makeTraceEvent(4, 'model'), 'completed').nodes[0],
      appendObservedNode(noResultBase, makeTraceEvent(5, 'validation'), 'completed').nodes[0],
      appendObservedNode(noResultBase, makeTraceEvent(6, 'context'), 'completed').nodes[0],
      appendObservedNode(noResultBase, makeTraceEvent(7, 'routing'), 'completed').nodes[0],
      appendObservedNode(noResultBase, makeTraceEvent(8, 'finished'), 'completed').nodes[0],
      appendObservedNode(noResultBase, makeTraceEvent(9, 'error'), 'failed').nodes[0],
    ];

    expect(appendedPhases.map((item) => [item?.label, item?.kind])).toEqual([
      ['Tool activity', 'tool'],
      ['custom', 'tool'],
      ['Compose answer', 'model'],
      ['Model activity', 'model'],
      ['Validate changes', 'validation'],
      ['Gather context', 'milestone'],
      ['Route', 'milestone'],
      ['Ready', 'milestone'],
      ['Run error', 'result'],
    ]);
  });
});
