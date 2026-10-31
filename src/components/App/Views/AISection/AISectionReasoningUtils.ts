import type {
  AgentActivityNode,
  AgentActivityNodeStatus,
  AgentActivityOutcome,
  AgentActivityState,
  AgentReasoningEntry,
  AgentSession,
} from '@/types/domain-types';

export type ReasoningGroup = {
  step: number | null;
  entries: AgentReasoningEntry[];
};

export type ReasoningViewType = 'visual' | 'text';

export type ModelProgress = {
  modelName: string;
  progress: number | null;
  detail: string;
};

export const normalizeReasoningViewType = (value: string | undefined): ReasoningViewType =>
  value === 'text' ? 'text' : 'visual';

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
