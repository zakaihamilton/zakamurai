import type {
  AgentActivityNode,
  AgentActivityNodeStatus,
  AgentActivityOutcome,
  AgentActivityPhase,
  AgentActivityState,
  AgentReasoningEntry,
  AgentSession,
} from '@/types/domain-types';

export type ReasoningGroup = {
  step: number | null;
  entries: AgentReasoningEntry[];
};

export type ReasoningViewType = 'visual' | 'activity' | 'text';

export type ModelProgress = {
  modelName: string;
  progress: number | null;
  detail: string;
};

export const normalizeReasoningViewType = (value: string | undefined): ReasoningViewType =>
  value === 'text' || value === 'activity' ? value : 'visual';

export type KeyedReasoningEntry = AgentReasoningEntry & { renderKey: string };

export const keyReasoningEntries = (entries: AgentReasoningEntry[]): KeyedReasoningEntry[] => {
  const occurrences = new Map<string, number>();
  return entries.map((entry) => {
    const baseKey = `${entry.timestamp}-${entry.text}`;
    const occurrence = occurrences.get(baseKey) || 0;
    occurrences.set(baseKey, occurrence + 1);
    return { ...entry, renderKey: `${baseKey}-${occurrence}` };
  });
};

export type TimelineStatus = 'neutral' | 'active' | 'success' | 'error';

const REASONING_LABEL_PATTERN = /^\*\*([^*]+):\*\*\s*/;

const ERROR_PATTERN = /failed|error|could not|cancelled|aborted/i;

const SUCCESS_PATTERN = /ready|completed|passed|saved|available/i;

export const extractReasoningLabel = (text: string): string | null => {
  const match = text.match(REASONING_LABEL_PATTERN);
  return match?.[1]?.trim() || null;
};

export const stripReasoningLabel = (text: string): string =>
  text.replace(REASONING_LABEL_PATTERN, '').trim();

export const getReasoningEntryStatus = ({
  text,
  isLast,
  isRunning,
}: {
  text: string;
  isLast: boolean;
  isRunning: boolean;
}): TimelineStatus => {
  if (ERROR_PATTERN.test(text)) return 'error';
  if (isRunning && isLast) return 'active';
  if (SUCCESS_PATTERN.test(text)) return 'success';
  return 'neutral';
};

export const getReasoningGroupStatus = (
  group: ReasoningGroup,
  isLastGroup: boolean,
  isRunning: boolean,
): TimelineStatus => {
  const entryStatuses = group.entries.map((entry, index) =>
    getReasoningEntryStatus({
      text: entry.text,
      isLast: isLastGroup && index === group.entries.length - 1,
      isRunning,
    }),
  );
  if (entryStatuses.includes('error')) return 'error';
  if (entryStatuses.includes('active')) return 'active';
  if (entryStatuses.includes('success')) return 'success';
  return 'neutral';
};

export const getRunStatus = (
  activeSession: AgentSession | null,
  latestError: string,
  hasContent: boolean,
): 'waiting' | 'running' | 'ready' | 'error' => {
  if (latestError || activeSession?.status === 'error') return 'error';
  if (activeSession?.status === 'running') return 'running';
  return hasContent ? 'ready' : 'waiting';
};

export type DisplayRunStatus = 'waiting' | 'running' | 'ready' | 'error' | 'stopped';

export const getActivityRunStatus = (
  activity: AgentActivityState | undefined,
  activeSession: AgentSession | null,
  latestError: string,
  hasContent: boolean,
): DisplayRunStatus => {
  if (activity?.outcome === 'error' || latestError || activeSession?.status === 'error')
    return 'error';
  if (activity?.outcome === 'aborted') return 'stopped';
  if (activity?.outcome === 'running' || activeSession?.status === 'running') return 'running';
  if (activity?.outcome === 'success' || hasContent) return 'ready';
  return 'waiting';
};

export const statusLabels: Record<AgentActivityNodeStatus, string> = {
  queued: 'Up next',
  active: 'Working',
  completed: 'Done',
  failed: 'Blocked',
  skipped: 'Skipped',
};

const outcomeLabels: Record<AgentActivityOutcome, string> = {
  idle: 'Waiting to start',
  running: 'Executing route',
  success: 'Route complete',
  error: 'Route stopped',
  aborted: 'Run stopped',
};

const outcomeBadgeLabels: Record<AgentActivityOutcome, string> = {
  idle: 'Waiting',
  running: 'In progress',
  success: 'Complete',
  error: 'Stopped',
  aborted: 'Stopped',
};

export const nodeDetail = (item: AgentActivityNode): string => {
  const detail = item.detail || item.reason || statusLabels[item.status];
  if (item.status === 'queued' || !/^up next:\s*/i.test(detail)) return detail;

  const reason = item.reason?.trim() || detail.replace(/^up next:\s*/i, '').trim();
  return item.reason ? `Reason: ${reason}` : reason;
};

export type GenerationProgressSummary = {
  characterCount: number | null;
  waitingLabel: string;
};

const formatGenerationWaitTarget = (target: string): string =>
  target
    .replace(/\bsource code\b/i, 'source')
    .replace(/\s+/g, ' ')
    .trim();

export const parseGenerationProgress = (detail: string): GenerationProgressSummary => {
  const characterMatch = detail.match(/(?:^|[;(]\s*)([\d,]+)\s+character\(s\)\s+received\b/i);
  const waitingMatch = detail.match(/waiting for\s+(.+?)\s+before validation/i);
  const characterCount = characterMatch?.[1]
    ? Number.parseInt(characterMatch[1].replaceAll(',', ''), 10)
    : null;
  const waitingTarget = waitingMatch?.[1]
    ? formatGenerationWaitTarget(waitingMatch[1].replace(/[.…]+$/, ''))
    : '';

  return {
    characterCount: Number.isFinite(characterCount) ? characterCount : null,
    waitingLabel: waitingTarget ? `Waiting for ${waitingTarget}` : 'Waiting for output to finish',
  };
};

export type LiveExecutionInfo = {
  title: string;
  detail: string;
  outcome: string;
  badge: string;
  tone: AgentActivityOutcome;
};

export const getLiveExecutionInfo = (activity: AgentActivityState): LiveExecutionInfo => {
  const currentNode = activity.nodes.find((item) => item.id === activity.currentNodeId);
  const fallbackOutcome = outcomeLabels[activity.outcome];
  const title = currentNode?.label || fallbackOutcome;
  const detailCandidate = currentNode ? nodeDetail(currentNode) : '';
  return {
    title,
    detail:
      detailCandidate && detailCandidate !== title && detailCandidate !== fallbackOutcome
        ? detailCandidate
        : '',
    outcome: fallbackOutcome,
    badge: outcomeBadgeLabels[activity.outcome],
    tone: activity.outcome,
  };
};

export type ProgressRoadmapStageId = 'request' | 'context' | 'work' | 'validation' | 'result';

export type ProgressRoadmapStageStatus = 'upcoming' | 'active' | 'completed' | 'failed' | 'skipped';

export type ProgressRoadmapStage = {
  id: ProgressRoadmapStageId;
  label: string;
  status: ProgressRoadmapStageStatus;
};

const roadmapStageConfig: Array<{
  id: ProgressRoadmapStageId;
  label: string;
  matches: (phase: AgentActivityPhase) => boolean;
}> = [
  {
    id: 'request',
    label: 'Request',
    matches: (phase) => phase === 'request' || phase === 'routing',
  },
  { id: 'context', label: 'Context', matches: (phase) => phase === 'context' },
  { id: 'work', label: 'Work', matches: (phase) => phase === 'work' || phase === 'recovery' },
  { id: 'validation', label: 'Validate', matches: (phase) => phase === 'validation' },
  { id: 'result', label: 'Result', matches: (phase) => phase === 'result' },
];

const roadmapStageIndexForPhase = (phase: AgentActivityPhase | null): number | null => {
  if (!phase) return null;
  const index = roadmapStageConfig.findIndex((stage) => stage.matches(phase));
  return index >= 0 ? index : null;
};

export const getProgressRoadmap = (activity: AgentActivityState): ProgressRoadmapStage[] => {
  const activeNode =
    activity.nodes.find((item) => item.id === activity.currentNodeId) ||
    activity.nodes.find((item) => item.status === 'active');
  const currentStageIndex = roadmapStageIndexForPhase(
    activity.currentPhase || activeNode?.phase || null,
  );
  const terminal = activity.outcome !== 'idle' && activity.outcome !== 'running';

  return roadmapStageConfig.map((stage, index) => {
    const stageNodes = activity.nodes.filter((item) => stage.matches(item.phase));
    const latestAttempt = [...stageNodes]
      .reverse()
      .find(
        (item) =>
          item.status === 'failed' || item.status === 'active' || item.status === 'completed',
      );
    const hasFailed = latestAttempt?.status === 'failed';
    const hasActive = latestAttempt?.status === 'active';
    const hasQueued = stageNodes.some((item) => item.status === 'queued');
    const hasCompletedAttempt = latestAttempt?.status === 'completed';

    let status: ProgressRoadmapStageStatus = 'upcoming';
    if (hasFailed) {
      status = 'failed';
    } else if (
      activity.outcome === 'aborted' &&
      stageNodes.some((item) => item.status === 'skipped')
    ) {
      status = 'skipped';
    } else if (hasActive || (activity.outcome === 'running' && currentStageIndex === index)) {
      status = 'active';
    } else if (
      stageNodes.length > 0 &&
      (stageNodes.every((item) => item.status === 'completed' || item.status === 'skipped') ||
        (hasCompletedAttempt && !hasQueued))
    ) {
      status =
        hasCompletedAttempt || stageNodes.some((item) => item.status === 'completed')
          ? 'completed'
          : 'skipped';
    } else if (hasQueued) {
      status = 'upcoming';
    } else if (
      activity.outcome === 'running' &&
      stage.id === 'validation' &&
      currentStageIndex !== null &&
      currentStageIndex >= 2 &&
      stageNodes.length === 0
    ) {
      status = 'skipped';
    } else if (terminal && currentStageIndex !== null && index < currentStageIndex) {
      status = stageNodes.length > 0 ? 'completed' : 'skipped';
    } else if (index === roadmapStageConfig.length - 1 && activity.outcome === 'success') {
      status = 'completed';
    } else if (index === roadmapStageConfig.length - 1 && activity.outcome === 'error') {
      status = 'failed';
    } else if (index === roadmapStageConfig.length - 1 && activity.outcome === 'aborted') {
      status = 'skipped';
    }

    return { id: stage.id, label: stage.label, status };
  });
};

export const getNextActivityNode = (
  activity: AgentActivityState,
): AgentActivityNode | undefined => {
  if (activity.outcome !== 'running') return undefined;

  const currentNode =
    activity.nodes.find((item) => item.id === activity.currentNodeId) ||
    activity.nodes.find((item) => item.status === 'active');
  const currentStageIndex = roadmapStageIndexForPhase(
    currentNode?.phase || activity.currentPhase || null,
  );
  const queuedNodes = activity.nodes.filter(
    (item) => item.status === 'queued' && item.phase !== 'request',
  );
  if (currentStageIndex === null) return queuedNodes[0];

  return (
    queuedNodes.find((item) => roadmapStageIndexForPhase(item.phase) === currentStageIndex) ||
    queuedNodes.find((item) => {
      const stageIndex = roadmapStageIndexForPhase(item.phase);
      return stageIndex !== null && stageIndex > currentStageIndex;
    }) ||
    queuedNodes[0]
  );
};

export const getRecentMilestones = (
  activity: AgentActivityState,
  limit = 3,
): AgentActivityNode[] => {
  const recent: AgentActivityNode[] = [];
  const seen = new Set<string>();

  for (const item of [...activity.nodes].reverse()) {
    if (
      item.status !== 'completed' ||
      item.phase === 'request' ||
      item.phase === 'routing' ||
      item.phase === 'result'
    ) {
      continue;
    }

    const key = `${item.label}|${item.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recent.push(item);
    if (recent.length >= limit) break;
  }

  return recent;
};
