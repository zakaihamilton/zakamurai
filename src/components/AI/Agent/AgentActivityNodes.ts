import type { ManagerEvent, ManagerStep } from '@/components/AI/types';
import type {
  AgentActivityNode,
  AgentActivityNodeKind,
  AgentActivityNodeStatus,
  AgentActivityPhase,
  AgentActivityState,
} from '@/types/domain-types';
import type { ManagerTraceEvent } from './ManagerTrace';

export const MAX_AGENT_ACTIVITY_NODES = 96;
export const MAX_AGENT_ACTIVITY_DETAIL_CHARACTERS = 1200;

const TERMINAL_NODE_STATUSES: AgentActivityNodeStatus[] = ['completed', 'failed', 'skipped'];

export const clip = (value: unknown, limit = MAX_AGENT_ACTIVITY_DETAIL_CHARACTERS): string => {
  const text = String(value ?? '').trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
};

export const timestamp = (): string => {
  const now = new Date();
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  return `${now.toTimeString().split(' ')[0]}.${milliseconds}`;
};

export const elapsedLabel = (elapsedMs: number | undefined): string => {
  if (!Number.isFinite(elapsedMs) || !elapsedMs || elapsedMs < 0) return '';
  const totalMilliseconds = Math.floor(elapsedMs);
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = totalMilliseconds % 1000;
  const paddedSeconds = String(seconds).padStart(2, '0');
  const paddedMilliseconds = String(milliseconds).padStart(3, '0');
  return `+${minutes}m ${paddedSeconds}.${paddedMilliseconds}s`;
};

export const capNodes = (nodes: AgentActivityNode[]): AgentActivityNode[] =>
  nodes.length <= MAX_AGENT_ACTIVITY_NODES
    ? nodes
    : [nodes[0], ...nodes.slice(-(MAX_AGENT_ACTIVITY_NODES - 1))];

export const node = (
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

export const getStepNode = (step: ManagerStep, index: number): AgentActivityNode => {
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

export const mergeNode = (existing: AgentActivityNode | undefined, next: AgentActivityNode) => {
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

const isTerminal = (status: AgentActivityNodeStatus): boolean =>
  TERMINAL_NODE_STATUSES.includes(status);

const actionName = (action: ManagerEvent['action'] | ManagerTraceEvent['action']): string =>
  typeof action === 'string' ? action : action?.action || '';

export const detailForEvent = (event: ManagerEvent | ManagerTraceEvent): string => {
  const action = actionName(event.action);
  return clip(
    event.message ||
      (event.tool ? `${toolLabels[event.tool] || event.tool} updated.` : '') ||
      (action ? `${action} updated.` : '') ||
      'Activity updated.',
  );
};

export const phaseForEvent = (phase: ManagerTraceEvent['phase']): AgentActivityPhase => {
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

export const findPlannedNode = (
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

export const withUpdatedNode = (
  activity: AgentActivityState,
  nodeId: string,
  patch: Partial<AgentActivityNode>,
): AgentActivityState => ({
  ...activity,
  nodes: activity.nodes.map((item) => (item.id === nodeId ? { ...item, ...patch } : item)),
});

export const activateNode = (
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

export const appendObservedNode = (
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

export const eventStatus = (event: ManagerTraceEvent): AgentActivityNodeStatus =>
  event.status === 'failed' ||
  event.errorCode ||
  event.protocolStatus === 'invalid' ||
  /\b(failed|failure|error|invalid|could not|unable)\b/i.test(
    `${event.message || ''} ${event.output || ''}`,
  )
    ? 'failed'
    : 'completed';
