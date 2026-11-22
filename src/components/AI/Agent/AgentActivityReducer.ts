import type { ManagerPlan, WebLLMRecoveryEvent } from '@/components/AI/types';
import type {
  AgentActivityNodeStatus,
  AgentActivityOutcome,
  AgentActivityState,
} from '@/types/domain-types';
import {
  activateNode,
  appendObservedNode,
  capNodes,
  clip,
  detailForEvent,
  elapsedLabel,
  eventStatus,
  findPlannedNode,
  getStepNode,
  mergeNode,
  node,
  phaseForEvent,
  timestamp,
  withUpdatedNode,
} from './AgentActivityNodes';
import type { ManagerTrace, ManagerTraceEvent } from './ManagerTrace';

export const applyManagerPlan = (
  activity: AgentActivityState,
  plan: ManagerPlan,
): AgentActivityState => {
  const existing = new Map(activity.nodes.map((item) => [item.id, item]));
  const routeNodes = [
    node({
      id: 'request',
      phase: 'request',
      kind: 'request',
      label: 'Request',
      status: 'completed',
      detail: activity.request || 'User request received.',
      timestamp: existing.get('request')?.timestamp || timestamp(),
    }),
    node({
      id: 'route',
      phase: 'routing',
      kind: 'milestone',
      label: 'Route',
      status: 'completed',
      detail: `Request routed to ${plan.intent}.`,
      timestamp: existing.get('route')?.timestamp || timestamp(),
    }),
    node({
      id: 'context',
      phase: 'context',
      kind: 'milestone',
      label: 'Gather context',
      status: existing.get('context')?.status || 'queued',
      detail:
        existing.get('context')?.detail || 'Workspace context will be gathered before work begins.',
      timestamp: existing.get('context')?.timestamp || '',
    }),
    ...plan.steps.map(getStepNode),
    node({
      id: 'result',
      phase: 'result',
      kind: 'result',
      label: 'Ready',
      status: existing.get('result')?.status || 'queued',
      detail: existing.get('result')?.detail || 'Waiting for the run to finish.',
      timestamp: existing.get('result')?.timestamp || '',
    }),
  ].map((next) => mergeNode(existing.get(next.id), next));
  const routeNodeIds = new Set(routeNodes.map((item) => item.id));
  const observedNodes = activity.nodes.filter((item) => !routeNodeIds.has(item.id));
  const resultIndex = routeNodes.findIndex((item) => item.id === 'result');
  routeNodes.splice(resultIndex >= 0 ? resultIndex : routeNodes.length, 0, ...observedNodes);

  return {
    ...activity,
    currentPhase: activity.currentPhase || 'context',
    currentNodeId: activity.currentNodeId === 'route' ? null : activity.currentNodeId,
    nodes: capNodes(routeNodes),
  };
};

const applyTraceEvent = (
  activity: AgentActivityState,
  event: ManagerTraceEvent,
): AgentActivityState => {
  const detail = detailForEvent(event);
  const phase = phaseForEvent(event.phase);

  if (event.phase === 'routing') {
    const route = activateNode(activity, 'route', 'routing');
    const updated = withUpdatedNode(route, 'route', {
      status: 'completed',
      detail,
      turn: event.turn,
      elapsedMs: event.elapsedMs,
      timestamp: elapsedLabel(event.elapsedMs),
    });
    return { ...updated, currentNodeId: null };
  }

  if (event.phase === 'finished') {
    const completed = {
      ...activity,
      currentPhase: 'result' as const,
      currentNodeId: null,
      nodes: activity.nodes.map((item) =>
        item.status === 'active' ? { ...item, status: 'completed' as const } : item,
      ),
    };
    return withUpdatedNode(completed, 'result', {
      status: 'completed',
      detail,
      turn: event.turn,
      elapsedMs: event.elapsedMs,
      timestamp: elapsedLabel(event.elapsedMs),
    });
  }

  if (event.phase === 'error') {
    const failed = {
      ...activity,
      currentPhase: 'result' as const,
      currentNodeId: null,
      nodes: activity.nodes.map((item) =>
        item.status === 'active' ? { ...item, status: 'failed' as const } : item,
      ),
    };
    return withUpdatedNode(failed, 'result', {
      status: 'failed',
      detail: detail || 'The run stopped with an error.',
      elapsedMs: event.elapsedMs,
      timestamp: elapsedLabel(event.elapsedMs),
    });
  }

  const target = findPlannedNode(activity, event);
  const isCompletion =
    event.status === 'completed' ||
    (event.phase === 'context' && Boolean(event.tool)) ||
    (event.phase === 'model' &&
      Boolean(
        event.output ||
          event.protocolStatus === 'valid' ||
          event.protocolStatus === 'response-received',
      )) ||
    (event.phase === 'validation' &&
      Boolean(
        event.output ||
          event.protocolStatus === 'valid' ||
          /\b(validation\s+)?(passed|completed|succeeded|successful)\b/i.test(event.message || ''),
      ));
  const status: AgentActivityNodeStatus = isCompletion ? eventStatus(event) : 'active';

  if (target) {
    const activated = status === 'active' ? activateNode(activity, target.id, phase) : activity;
    const next = withUpdatedNode(activated, target.id, {
      status,
      detail,
      turn: event.turn,
      elapsedMs: event.elapsedMs,
      timestamp: elapsedLabel(event.elapsedMs),
      ...(event.input ? { input: clip(event.input) } : {}),
      ...(event.output ? { output: clip(event.output) } : {}),
      ...(event.provenance ? { provenance: event.provenance } : {}),
    });
    if (status !== 'active' && next.currentNodeId === target.id) {
      return { ...next, currentNodeId: null };
    }
    if (event.phase === 'context' && event.tool) {
      return withUpdatedNode(next, 'context', {
        status: 'completed',
        detail: 'Workspace context gathered.',
      });
    }
    return next;
  }

  const observed = appendObservedNode(activity, event, status);
  const observedId = `event-${event.sequence}`;
  return status === 'active' ? activateNode(observed, observedId, phase) : observed;
};

export const applyManagerTrace = (
  activity: AgentActivityState,
  trace: ManagerTrace,
): AgentActivityState => {
  const plan = trace.plan || trace.events.find((event) => event.plan)?.plan;
  let next = plan ? applyManagerPlan(activity, plan) : activity;
  for (const event of trace.events) {
    if (event.sequence <= next.lastTraceSequence) continue;
    next = applyTraceEvent(next, event);
    next.lastTraceSequence = event.sequence;
  }
  const hasTerminalEvent = trace.events.some(
    (event) => event.phase === 'finished' || event.phase === 'error',
  );
  if (
    (trace.outcome === 'aborted' || (trace.outcome !== 'running' && !hasTerminalEvent)) &&
    next.nodes.find((item) => item.id === 'result')?.status !==
      (trace.outcome === 'aborted'
        ? 'skipped'
        : trace.outcome === 'success'
          ? 'completed'
          : 'failed')
  ) {
    next = finishAgentActivity(
      next,
      trace.outcome === 'success' ? 'success' : trace.outcome === 'aborted' ? 'aborted' : 'error',
      trace.outcome === 'success' ? 'Run completed.' : 'Run stopped before completion.',
      trace.endedAt,
    );
  }
  return {
    ...next,
    runId: trace.runId,
    durationMs: trace.durationMs ?? Math.max(0, Date.now() - next.startedAt),
    outcome:
      trace.outcome === 'success'
        ? 'success'
        : trace.outcome === 'error'
          ? 'error'
          : trace.outcome === 'aborted'
            ? 'aborted'
            : 'running',
  };
};

export const applyRecovery = (
  activity: AgentActivityState,
  recovery: WebLLMRecoveryEvent,
): AgentActivityState => {
  const recoveryNode = node({
    id: `recovery-${activity.nodes.filter((item) => item.kind === 'recovery').length + 1}`,
    phase: 'recovery',
    kind: 'recovery',
    label: recovery.action === 'fallback' ? 'Switch model' : 'Recover model',
    status: 'completed',
    detail: `Recovered after ${recovery.reason.replaceAll('-', ' ')}; continuing with ${recovery.modelId}.`,
    timestamp: timestamp(),
    provenance: 'recovery',
  });
  const resultIndex = activity.nodes.findIndex((item) => item.id === 'result');
  const nodes = [...activity.nodes];
  nodes.splice(resultIndex >= 0 ? resultIndex : nodes.length, 0, recoveryNode);
  return { ...activity, nodes: capNodes(nodes) };
};

export const finishAgentActivity = (
  activity: AgentActivityState,
  outcome: Exclude<AgentActivityOutcome, 'idle' | 'running'>,
  detail: string,
  endedAt = Date.now(),
): AgentActivityState => {
  const resultStatus: AgentActivityNodeStatus =
    outcome === 'success' ? 'completed' : outcome === 'aborted' ? 'skipped' : 'failed';
  const nodes = activity.nodes.map((item) => {
    if (item.id === 'result') {
      return {
        ...item,
        status: resultStatus,
        detail: clip(detail) || item.detail,
        timestamp: timestamp(),
      };
    }
    if (item.status === 'active') {
      return {
        ...item,
        status: (outcome === 'success'
          ? 'completed'
          : outcome === 'aborted'
            ? 'skipped'
            : 'failed') as AgentActivityNodeStatus,
      };
    }
    if (item.status === 'queued') return { ...item, status: 'skipped' as const };
    return item;
  });
  return {
    ...activity,
    outcome,
    currentPhase: 'result',
    currentNodeId: null,
    durationMs: Math.max(
      activity.durationMs,
      activity.startedAt ? endedAt - activity.startedAt : 0,
    ),
    nodes,
  };
};
