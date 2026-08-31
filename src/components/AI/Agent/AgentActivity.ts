import type {
  ManagerEvent,
  ManagerPlan,
  ManagerStep,
  WebLLMRecoveryEvent,
} from '@/components/AI/types';
import type {
  AgentActivityNode,
  AgentActivityNodeKind,
  AgentActivityNodeStatus,
  AgentActivityOutcome,
  AgentActivityPhase,
  AgentActivityState,
  AgentReasoningEntry,
} from '@/types/domain-types';
import type { ManagerTrace, ManagerTraceEvent } from './ManagerTrace';

export const MAX_AGENT_ACTIVITY_NODES = 96;
export const MAX_AGENT_ACTIVITY_DETAIL_CHARACTERS = 1200;

const TERMINAL_NODE_STATUSES: AgentActivityNodeStatus[] = ['completed', 'failed', 'skipped'];

const clip = (value: unknown, limit = MAX_AGENT_ACTIVITY_DETAIL_CHARACTERS): string => {
  const text = String(value ?? '').trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
};

const timestamp = (): string => new Date().toTimeString().split(' ')[0];

const elapsedLabel = (elapsedMs: number | undefined): string => {
  if (!Number.isFinite(elapsedMs) || !elapsedMs || elapsedMs < 0) return '';
  return `+${(elapsedMs / 1000).toFixed(1)}s`;
};

const capNodes = (nodes: AgentActivityNode[]): AgentActivityNode[] =>
  nodes.length <= MAX_AGENT_ACTIVITY_NODES
    ? nodes
    : [nodes[0], ...nodes.slice(-(MAX_AGENT_ACTIVITY_NODES - 1))];

const node = (
  value: Pick<AgentActivityNode, 'id' | 'phase' | 'kind' | 'label' | 'status'> &
    Partial<AgentActivityNode>,
): AgentActivityNode => ({
  id: value.id,
  phase: value.phase,
  kind: value.kind,
  status: value.status,
  label: clip(value.label, 180),
  detail: clip(value.detail),
  ...(value.reason ? { reason: clip(value.reason) } : {}),
  ...(value.tool ? { tool: value.tool } : {}),
  ...(value.task ? { task: value.task } : {}),
  ...(value.turn !== undefined ? { turn: value.turn } : {}),
  timestamp: value.timestamp || '',
  ...(value.elapsedMs !== undefined ? { elapsedMs: value.elapsedMs } : {}),
  ...(value.input ? { input: clip(value.input) } : {}),
  ...(value.output ? { output: clip(value.output) } : {}),
  ...(value.provenance ? { provenance: value.provenance } : {}),
});

export const createIdleAgentActivity = (request = ''): AgentActivityState => ({
  runId: null,
  request: clip(request),
  outcome: 'idle',
  currentPhase: null,
  currentNodeId: null,
  startedAt: 0,
  durationMs: 0,
  lastTraceSequence: 0,
  nodes: [],
});

export const createRunningAgentActivity = (
  request: string,
  startedAt = Date.now(),
): AgentActivityState => ({
  runId: null,
  request: clip(request),
  outcome: 'running',
  currentPhase: 'routing',
  currentNodeId: 'route',
  startedAt,
  durationMs: 0,
  lastTraceSequence: 0,
  nodes: [
    node({
      id: 'request',
      phase: 'request',
      kind: 'request',
      label: 'Request',
      status: 'completed',
      detail: clip(request) || 'User request received.',
      timestamp: timestamp(),
    }),
    node({
      id: 'route',
      phase: 'routing',
      kind: 'milestone',
      label: 'Route',
      status: 'active',
      detail: 'Preparing the execution route…',
      timestamp: timestamp(),
    }),
    node({
      id: 'context',
      phase: 'context',
      kind: 'milestone',
      label: 'Gather context',
      status: 'queued',
      detail: 'Workspace context will be gathered before work begins.',
    }),
    node({
      id: 'result',
      phase: 'result',
      kind: 'result',
      label: 'Ready',
      status: 'queued',
      detail: 'Waiting for the run to finish.',
    }),
  ],
});

const toolLabels: Record<string, string> = {
  list_files: 'List workspace',
  search_workspace: 'Search workspace',
  search_semantic: 'Search context',
  read_file: 'Read source',
  write_file: 'Write files',
  replace_file_content: 'Update source',
  delete_file: 'Delete files',
  validate: 'Validate changes',
  list_project_checks: 'Discover checks',
  run_project_check: 'Run project check',
  inspect_preview: 'Inspect preview',
  inspect_console_logs: 'Inspect console',
  get_file_symbols: 'Inspect symbols',
  manage_packages: 'Manage packages',
};

const modelLabels: Record<string, string> = {
  answer: 'Compose answer',
  'generate-changes': 'Generate changes',
  'repair-changes': 'Repair changes',
};

const getStepNode = (step: ManagerStep, index: number): AgentActivityNode => {
  if (step.kind === 'tool') {
    const isValidation = step.tool === 'validate';
    return node({
      id: `plan-${index}`,
      phase: isValidation ? 'validation' : 'work',
      kind: isValidation ? 'validation' : 'tool',
      label: toolLabels[step.tool] || step.tool,
      status: 'queued',
      detail: `Up next: ${step.reason}`,
      reason: step.reason,
      tool: step.tool,
    });
  }
  return node({
    id: `plan-${index}`,
    phase: 'work',
    kind: 'model',
    label: modelLabels[step.task] || 'Work with model',
    status: 'queued',
    detail: `Up next: ${step.reason}`,
    reason: step.reason,
    task: step.task,
  });
};

const mergeNode = (existing: AgentActivityNode | undefined, next: AgentActivityNode) => {
  if (!existing) return next;
  const status =
    existing.id === 'route' && existing.status === 'active' ? next.status : existing.status;
  const hasFreshPlanDetail =
    next.id === 'route' ||
    ![
      'Preparing the execution route…',
      'Workspace context will be gathered before work begins.',
      'Waiting for the run to finish.',
    ].includes(existing.detail);
  return {
    ...next,
    ...existing,
    status,
    detail: hasFreshPlanDetail ? next.detail : existing.detail,
  };
};

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

const isTerminal = (status: AgentActivityNodeStatus): boolean =>
  TERMINAL_NODE_STATUSES.includes(status);

const actionName = (action: ManagerEvent['action'] | ManagerTraceEvent['action']): string =>
  typeof action === 'string' ? action : action?.action || '';

const detailForEvent = (event: ManagerEvent | ManagerTraceEvent): string => {
  const action = actionName(event.action);
  return clip(
    event.message ||
      (event.tool ? `${toolLabels[event.tool] || event.tool} updated.` : '') ||
      (action ? `${action} updated.` : '') ||
      'Activity updated.',
  );
};

const phaseForEvent = (phase: ManagerTraceEvent['phase']): AgentActivityPhase => {
  if (phase === 'routing') return 'routing';
  if (phase === 'context') return 'context';
  if (phase === 'validation') return 'validation';
  if (phase === 'finished' || phase === 'error') return 'result';
  return 'work';
};

const kindForEvent = (event: ManagerTraceEvent): AgentActivityNodeKind => {
  if (event.phase === 'validation') return 'validation';
  if (event.phase === 'tool') return 'tool';
  if (event.phase === 'model') return 'model';
  if (event.phase === 'error') return 'result';
  return 'milestone';
};

const findPlannedNode = (
  activity: AgentActivityState,
  event: ManagerTraceEvent,
): AgentActivityNode | undefined => {
  const candidates = activity.nodes.filter((item) => {
    if (isTerminal(item.status)) return false;
    if (event.tool && item.tool === event.tool) return true;
    if (event.task && item.task === event.task) return true;
    if (event.phase === 'context' && !event.tool && item.id === 'context') return true;
    if (event.phase === 'validation' && item.kind === 'validation') return true;
    return false;
  });
  return candidates[0];
};

const withUpdatedNode = (
  activity: AgentActivityState,
  nodeId: string,
  patch: Partial<AgentActivityNode>,
): AgentActivityState => ({
  ...activity,
  nodes: activity.nodes.map((item) => (item.id === nodeId ? { ...item, ...patch } : item)),
});

const activateNode = (
  activity: AgentActivityState,
  targetId: string,
  phase: AgentActivityPhase,
): AgentActivityState => ({
  ...activity,
  currentPhase: phase,
  currentNodeId: targetId,
  nodes: activity.nodes.map((item) =>
    item.id === targetId
      ? { ...item, status: 'active' }
      : item.id === activity.currentNodeId && item.status === 'active'
        ? { ...item, status: 'completed' }
        : item,
  ),
});

const appendObservedNode = (
  activity: AgentActivityState,
  event: ManagerTraceEvent,
  status: AgentActivityNodeStatus,
): AgentActivityState => {
  const observed = node({
    id: `event-${event.sequence}`,
    phase: phaseForEvent(event.phase),
    kind: kindForEvent(event),
    label:
      event.phase === 'tool'
        ? toolLabels[event.tool || ''] || event.tool || 'Tool activity'
        : event.phase === 'model'
          ? modelLabels[event.task || ''] || 'Model activity'
          : event.phase === 'validation'
            ? 'Validate changes'
            : event.phase === 'context'
              ? 'Gather context'
              : event.phase === 'routing'
                ? 'Route'
                : event.phase === 'finished'
                  ? 'Ready'
                  : 'Run error',
    status,
    detail: detailForEvent(event),
    tool: event.tool,
    task: event.task,
    turn: event.turn,
    timestamp: elapsedLabel(event.elapsedMs),
    elapsedMs: event.elapsedMs,
    input: event.input,
    output: event.output,
    provenance: event.provenance,
  });
  const resultIndex = activity.nodes.findIndex((item) => item.id === 'result');
  const nodes = [...activity.nodes];
  nodes.splice(resultIndex >= 0 ? resultIndex : nodes.length, 0, observed);
  return { ...activity, nodes: capNodes(nodes) };
};

const eventStatus = (event: ManagerTraceEvent): AgentActivityNodeStatus =>
  event.status === 'failed' ||
  event.errorCode ||
  event.protocolStatus === 'invalid' ||
  /\b(failed|failure|error|invalid|could not|unable)\b/i.test(
    `${event.message || ''} ${event.output || ''}`,
  )
    ? 'failed'
    : 'completed';

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

export const applyReasoningFallback = (
  request: string,
  entries: AgentReasoningEntry[],
  sessionStatus: string,
): AgentActivityState => {
  if (!entries.length) return createIdleAgentActivity(request);
  const base = createRunningAgentActivity(request);
  const limitedEntries = entries.slice(-MAX_AGENT_ACTIVITY_NODES + 4);
  const observed = limitedEntries.map((entry, index) => {
    const match = entry.text.match(/^\*\*([^*]+):\*\*\s*/);
    const label = match?.[1]?.trim() || 'Activity';
    const detail = clip(entry.text.replace(/^\*\*([^*]+):\*\*\s*/, '').trim() || entry.text);
    const failed = /failed|error|could not|cancelled|aborted/i.test(entry.text);
    const active = sessionStatus === 'running' && index === limitedEntries.length - 1;
    return node({
      id: `legacy-${index}`,
      phase: label.toLowerCase().includes('validation') ? 'validation' : 'work',
      kind: label.toLowerCase().includes('tool') ? 'tool' : 'milestone',
      label,
      status: failed ? 'failed' : active ? 'active' : 'completed',
      detail,
      turn: entry.turn,
      timestamp: entry.timestamp,
      input: entry.input,
      output: entry.output,
    });
  });
  const resultStatus: AgentActivityNodeStatus =
    sessionStatus === 'running' ? 'queued' : sessionStatus === 'error' ? 'failed' : 'completed';
  return {
    ...base,
    outcome:
      sessionStatus === 'running' ? 'running' : sessionStatus === 'error' ? 'error' : 'success',
    currentPhase: sessionStatus === 'running' ? 'work' : 'result',
    currentNodeId:
      sessionStatus === 'running' && observed.length ? `legacy-${observed.length - 1}` : null,
    nodes: capNodes(
      [
        base.nodes[0],
        node({
          id: 'route',
          phase: 'routing',
          kind: 'milestone',
          label: 'Observed run',
          status: 'completed',
          detail: 'Showing activity recorded by an earlier session.',
          timestamp: base.nodes[1]?.timestamp,
        }),
        ...observed,
        node({
          id: 'result',
          phase: 'result',
          kind: 'result',
          label: 'Ready',
          status: resultStatus,
          detail:
            sessionStatus === 'running'
              ? 'Waiting for the run to finish.'
              : 'Run history available.',
        }),
      ].filter(Boolean),
    ),
  };
};

export const normalizeAgentActivity = (value: unknown): AgentActivityState | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Partial<AgentActivityState>;
  if (!Array.isArray(raw.nodes)) return undefined;
  const validPhases: AgentActivityPhase[] = [
    'request',
    'routing',
    'context',
    'work',
    'validation',
    'recovery',
    'result',
  ];
  const validKinds: AgentActivityNodeKind[] = [
    'request',
    'milestone',
    'tool',
    'model',
    'validation',
    'recovery',
    'result',
  ];
  const validStatuses: AgentActivityNodeStatus[] = [
    'queued',
    'active',
    'completed',
    'failed',
    'skipped',
  ];
  const nodes = raw.nodes
    .filter((item): item is AgentActivityNode => Boolean(item) && typeof item === 'object')
    .map((item, index) => {
      const status = validStatuses.includes(item.status) ? item.status : 'queued';
      const phase = validPhases.includes(item.phase) ? item.phase : 'work';
      const kind = validKinds.includes(item.kind) ? item.kind : 'milestone';
      return node({
        id: typeof item.id === 'string' ? item.id : `activity-${index}`,
        phase,
        kind,
        status,
        label: typeof item.label === 'string' ? clip(item.label, 180) : 'Activity',
        detail: typeof item.detail === 'string' ? item.detail : '',
        reason: typeof item.reason === 'string' ? item.reason : undefined,
        tool: typeof item.tool === 'string' ? item.tool : undefined,
        task: typeof item.task === 'string' ? item.task : undefined,
        turn: typeof item.turn === 'number' ? item.turn : undefined,
        timestamp: typeof item.timestamp === 'string' ? item.timestamp : '',
        elapsedMs: typeof item.elapsedMs === 'number' ? item.elapsedMs : undefined,
        input: typeof item.input === 'string' ? item.input : undefined,
        output: typeof item.output === 'string' ? item.output : undefined,
        provenance:
          item.provenance === 'model' || item.provenance === 'recovery'
            ? item.provenance
            : undefined,
      });
    })
    .slice(-MAX_AGENT_ACTIVITY_NODES);
  const outcomes: AgentActivityOutcome[] = ['idle', 'running', 'success', 'error', 'aborted'];
  return {
    runId: typeof raw.runId === 'string' ? raw.runId : null,
    request: typeof raw.request === 'string' ? clip(raw.request) : '',
    outcome: outcomes.includes(raw.outcome as AgentActivityOutcome)
      ? (raw.outcome as AgentActivityOutcome)
      : 'idle',
    currentPhase: validPhases.includes(raw.currentPhase as AgentActivityPhase)
      ? (raw.currentPhase as AgentActivityPhase)
      : null,
    currentNodeId: typeof raw.currentNodeId === 'string' ? raw.currentNodeId : null,
    startedAt:
      typeof raw.startedAt === 'number' && Number.isFinite(raw.startedAt) ? raw.startedAt : 0,
    durationMs:
      typeof raw.durationMs === 'number' && Number.isFinite(raw.durationMs)
        ? Math.max(0, raw.durationMs)
        : 0,
    lastTraceSequence:
      typeof raw.lastTraceSequence === 'number' && Number.isFinite(raw.lastTraceSequence)
        ? Math.max(0, raw.lastTraceSequence)
        : 0,
    nodes,
  };
};
