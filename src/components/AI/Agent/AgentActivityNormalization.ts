import type {
  AgentActivityNode,
  AgentActivityNodeKind,
  AgentActivityNodeStatus,
  AgentActivityOutcome,
  AgentActivityPhase,
  AgentActivityState,
  AgentReasoningEntry,
} from '@/types/domain-types';
import {
  MAX_AGENT_ACTIVITY_NODES,
  capNodes,
  clip,
  createIdleAgentActivity,
  createRunningAgentActivity,
  node,
} from './AgentActivityNodes';

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
