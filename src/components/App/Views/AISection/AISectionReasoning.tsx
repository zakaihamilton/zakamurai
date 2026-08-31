import { applyReasoningFallback } from '@/components/AI/Agent/AgentActivity';
import { withoutManagerErrorMessages } from '@/components/App/Panes/Prompt/AgentSessions';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import type {
  AgentActivityNode,
  AgentActivityNodeKind,
  AgentActivityNodeStatus,
  AgentActivityOutcome,
  AgentActivityState,
  AgentReasoningEntry,
  AgentSession,
  AgentSessionMessage,
} from '@/types/domain-types';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import styles from './AISectionReasoning.module.css';

export type ReasoningGroup = { step: number | null; entries: AgentReasoningEntry[] };
export type ReasoningViewType = 'visual' | 'text';

export type ModelProgress = {
  modelName: string;
  progress: number | null;
  detail: string;
};

export const normalizeReasoningViewType = (value: string | undefined): ReasoningViewType =>
  value === 'text' ? 'text' : 'visual';

type AISectionReasoningProps = {
  activeSession: AgentSession | null;
  reasoningGroups: ReasoningGroup[];
  visualReasoningGroups?: ReasoningGroup[];
  activity?: AgentActivityState;
  modelProgress?: ModelProgress;
  timelineExpanded?: boolean;
  viewType?: ReasoningViewType;
  showStepIO?: boolean;
  runUsageSummary: string;
  latestError?: string;
  fallbackContent: string;
  content: string;
  contentRef: RefObject<HTMLDivElement | null>;
  autoScroll?: boolean;
  onUserScroll?: (autoScroll: boolean) => void;
};

const markdownComponents: Components = {
  a: ({ node, ...props }) => <a className={styles.link} {...props} />,
  blockquote: ({ node, ...props }) => <blockquote className={styles.blockquote} {...props} />,
  code: ({ node, ...props }) => <code className={styles.code} {...props} />,
  h1: ({ node, ...props }) => <h1 className={styles.heading} {...props} />,
  h2: ({ node, ...props }) => <h2 className={styles.heading} {...props} />,
  h3: ({ node, ...props }) => <h3 className={styles.heading} {...props} />,
  h4: ({ node, ...props }) => <h4 className={styles.heading} {...props} />,
  h5: ({ node, ...props }) => <h5 className={styles.heading} {...props} />,
  h6: ({ node, ...props }) => <h6 className={styles.heading} {...props} />,
  li: ({ node, ...props }) => <li className={styles.listItem} {...props} />,
  ol: ({ node, ...props }) => <ol className={styles.list} {...props} />,
  p: ({ node, ...props }) => <p className={styles.paragraph} {...props} />,
  pre: ({ node, ...props }) => <pre className={styles.pre} {...props} />,
  ul: ({ node, ...props }) => <ul className={styles.list} {...props} />,
};

const summaryMarkdownComponents: Components = {
  code: ({ node, ...props }) => <code className={styles.code} {...props} />,
  h2: ({ node, ...props }) => <h2 className={styles.stepHeading} {...props} />,
  li: ({ node, ...props }) => <li className={styles.listItem} {...props} />,
  p: ({ node, ...props }) => <p className={styles.paragraph} {...props} />,
  ul: ({ node, ...props }) => <ul className={styles.list} {...props} />,
};

function Transcript({ messages }: { messages: AgentSessionMessage[] }) {
  return (
    <section className={styles.transcriptSection} aria-label="Session transcript">
      {messages.map((message) => {
        const label =
          message.role === 'user'
            ? 'You'
            : message.role === 'ai'
              ? message.agentRole
                ? `AI · ${message.agentRole}`
                : 'AI'
              : 'System';
        return (
          <article className={styles.reasoningEntry} key={message.id}>
            <div className={styles.timestamp}>
              {message.timestamp ? <time>{message.timestamp}</time> : null}
              {message.timestamp ? ' · ' : ''}
              <span className={styles.transcriptType}>{label}</span>
            </div>
            <div className={`${styles.reasoningText} ${styles.transcriptText}`}>{message.text}</div>
          </article>
        );
      })}
    </section>
  );
}

type KeyedReasoningEntry = AgentReasoningEntry & { renderKey: string };

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

const formatDuration = (milliseconds: number): string => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '—';
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
};

type DisplayRunStatus = 'waiting' | 'running' | 'ready' | 'error' | 'stopped';

const getActivityRunStatus = (
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

function RunOverview({
  activeSession,
  activity,
  latestError,
  hasContent,
}: {
  activeSession: AgentSession | null;
  activity: AgentActivityState;
  latestError: string;
  hasContent: boolean;
}) {
  const runUsage = activeSession?.runUsage;
  const toolCount = Object.values(runUsage?.toolCalls || {}).reduce(
    (total, count) => total + count,
    0,
  );
  const hasUsage = Boolean(
    runUsage && (runUsage.modelCalls > 0 || toolCount > 0 || runUsage.totalMs > 0),
  );
  const status = getActivityRunStatus(activity, activeSession, latestError, hasContent);
  const statusLabels: Record<DisplayRunStatus, string> = {
    waiting: 'Waiting',
    running: 'Working',
    ready: 'Ready',
    error: 'Error',
    stopped: 'Stopped',
  };
  const liveExecution = getLiveExecutionInfo(activity);

  return (
    <section className={styles.runOverview} aria-label="Run overview">
      <div className={styles.runStatus}>
        <span
          className={`${styles.statusMarker} ${styles[`statusMarker${status}`]}`}
          aria-hidden="true"
        />
        <div>
          <span className={styles.runStatusLabel}>Run status</span>
          <strong>{statusLabels[status]}</strong>
          {activity?.request ? <span className={styles.runRequest}>{activity.request}</span> : null}
        </div>
      </div>
      <section className={styles.runExecution} aria-label="Live execution">
        <span
          className={`${styles.runExecutionIndicator} ${styles[`runExecutionIndicator${liveExecution.tone}`]}`}
          aria-hidden="true"
        />
        <div className={styles.runExecutionCopy}>
          <strong className={styles.runExecutionTitle}>{liveExecution.title}</strong>
          {liveExecution.detail ? (
            <span className={styles.runExecutionDetail}>{liveExecution.detail}</span>
          ) : null}
        </div>
        <span
          className={`${styles.runExecutionOutcome} ${styles[`runExecutionOutcome${liveExecution.tone}`]}`}
        >
          {liveExecution.badge}
        </span>
      </section>
      {hasUsage ? (
        <dl className={styles.metricGrid}>
          <div>
            <dt>Model calls</dt>
            <dd>{runUsage?.modelCalls || 0}</dd>
          </div>
          <div>
            <dt>Tools</dt>
            <dd>{toolCount}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{formatDuration(activity?.durationMs || runUsage?.totalMs || 0)}</dd>
          </div>
          <div>
            <dt>Validation</dt>
            <dd>{runUsage?.finalValidationStatus || 'unavailable'}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}

const activityIcons: Record<AgentActivityNodeKind, typeof Icons.AIPrompt> = {
  request: Icons.AIPrompt,
  milestone: Icons.Brain,
  tool: Icons.Terminal,
  model: Icons.Sparkles,
  validation: Icons.Check,
  recovery: Icons.Refresh,
  result: Icons.Check,
};

const statusLabels: Record<AgentActivityNodeStatus, string> = {
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

const nodeDetail = (item: AgentActivityNode): string =>
  item.detail || item.reason || statusLabels[item.status];

const isLiveGenerationNode = (item: AgentActivityNode): boolean =>
  item.kind === 'model' && item.task === 'generate-changes' && item.status === 'active';

type GenerationProgressSummary = {
  characterCount: number | null;
  waitingLabel: string;
};

const formatGenerationWaitTarget = (target: string): string =>
  target
    .replace(/\bsource code\b/i, 'source')
    .replace(/\s+/g, ' ')
    .trim();

const parseGenerationProgress = (detail: string): GenerationProgressSummary => {
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

function ActivityNode({
  item,
  index,
  isCurrent,
  isWorking,
  isSelected,
  showStepIO,
}: {
  item: AgentActivityNode;
  index: number;
  isCurrent: boolean;
  isWorking: boolean;
  isSelected: boolean;
  showStepIO: boolean;
}) {
  const ActivityIcon = activityIcons[item.kind];
  const isLiveGeneration = isLiveGenerationNode(item);
  const generationProgress = isLiveGeneration ? parseGenerationProgress(item.detail) : null;
  const metadata = [
    item.tool ? item.tool : item.task ? item.task : '',
    item.turn !== undefined ? `turn ${item.turn}` : '',
    item.elapsedMs !== undefined ? formatDuration(item.elapsedMs) : '',
  ].filter(Boolean);

  return (
    <li
      className={`${styles.executionNode} ${styles[`executionNode${item.status}`]} ${styles[`executionNode${item.kind}`]} ${isLiveGeneration ? styles.executionNodeLiveGeneration : ''} ${isWorking ? styles.executionNodeWorking : ''} ${isSelected ? styles.executionNodeSelected : ''}`}
      data-card-id={item.id}
      data-card-selected={isSelected ? 'true' : undefined}
      data-card-working={isWorking ? 'true' : undefined}
      data-card-variant={isLiveGeneration ? 'live-generation' : undefined}
      aria-current={isCurrent ? 'step' : undefined}
    >
      <span className={styles.executionMarker} aria-hidden="true">
        {item.status === 'completed' ? <Icons.Check size={13} /> : <ActivityIcon size={14} />}
      </span>
      <article
        className={`${styles.executionCard} ${isLiveGeneration ? styles.executionGenerationCard : ''}`}
      >
        {isLiveGeneration ? (
          <div
            className={`${styles.executionCardArt} ${styles.executionCardArtGeneration}`}
            aria-hidden="true"
          >
            <span className={styles.executionCardIndex}>{String(index + 1).padStart(2, '0')}</span>
            <span className={styles.generationArtBadge}>
              <span className={styles.generationArtLiveDot} />
              Live model output
            </span>
            <span className={styles.generationArtIcon}>
              <Icons.Code size={32} />
              <span className={styles.generationArtSparkle}>
                <Icons.Sparkles size={14} />
              </span>
            </span>
            <span className={styles.generationArtStream}>
              <span
                className={`${styles.generationArtStreamLine} ${styles.generationArtStreamLineShort}`}
              />
              <span className={styles.generationArtStreamLine} />
              <span
                className={`${styles.generationArtStreamLine} ${styles.generationArtStreamLineMedium}`}
              />
              <span
                className={`${styles.generationArtStreamLine} ${styles.generationArtStreamLineShort}`}
              />
            </span>
            <span className={styles.executionCardArtLabel}>streaming</span>
          </div>
        ) : (
          <div className={`${styles.executionCardArt} ${styles[`executionCardArt${item.kind}`]}`}>
            <span className={styles.executionCardIndex}>{String(index + 1).padStart(2, '0')}</span>
            <span className={styles.executionCardArtIcon} aria-hidden="true">
              <ActivityIcon size={38} />
            </span>
            <span className={styles.executionCardArtLabel}>{item.kind}</span>
          </div>
        )}
        <div
          className={`${styles.executionCardBody} ${isLiveGeneration ? styles.executionGenerationBody : ''}`}
        >
          <header className={styles.executionCardHeader}>
            <div className={styles.executionTitleGroup}>
              <span className={styles.executionTitle}>{item.label}</span>
              {metadata.length ? (
                <span className={styles.executionMeta}>
                  {metadata.map((value) => (
                    <span className={styles.executionMetaItem} key={value}>
                      {value}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
            <span className={styles.executionStatus}>{statusLabels[item.status]}</span>
          </header>
          {isLiveGeneration ? (
            <>
              <output
                className={styles.executionGenerationSummary}
                aria-live="polite"
                aria-atomic="true"
              >
                <div className={styles.executionGenerationSummaryHeading}>
                  <strong>Generating changes</strong>
                  <span>Streaming</span>
                </div>
                <div className={styles.executionGenerationProgress}>
                  <div className={styles.executionGenerationMeter} aria-hidden="true">
                    <span className={styles.executionGenerationMeterFill} />
                  </div>
                  <div className={styles.executionGenerationMetric}>
                    <strong>
                      {generationProgress?.characterCount === null
                        ? '…'
                        : generationProgress?.characterCount.toLocaleString()}
                    </strong>
                    <span>
                      {generationProgress?.characterCount === null
                        ? 'receiving output'
                        : 'characters received'}
                    </span>
                  </div>
                </div>
                <div className={styles.executionGenerationWait}>
                  <span className={styles.executionGenerationWaitDot} aria-hidden="true" />
                  <span className={styles.executionGenerationWaitText}>
                    {generationProgress?.waitingLabel}
                  </span>
                </div>
              </output>
              <details className={styles.executionGenerationDetails}>
                <summary>
                  <span>Generation details</span>
                  <span className={styles.executionGenerationDetailsIcon} aria-hidden="true">
                    <Icons.ChevronDown />
                  </span>
                </summary>
                <p className={styles.executionGenerationRawDetail}>{item.detail}</p>
              </details>
            </>
          ) : (
            <p className={styles.executionDetail}>{nodeDetail(item)}</p>
          )}
          {item.status === 'queued' && item.reason && item.reason !== item.detail ? (
            <p className={styles.executionReason}>{item.reason}</p>
          ) : null}
          {showStepIO && (item.input || item.output) ? (
            <details className={styles.executionIO}>
              <summary>Input / output</summary>
              {item.input ? (
                <div>
                  <span>Input</span>
                  <pre>{item.input}</pre>
                </div>
              ) : null}
              {item.output ? (
                <div>
                  <span>Output</span>
                  <pre>{item.output}</pre>
                </div>
              ) : null}
            </details>
          ) : null}
        </div>
      </article>
    </li>
  );
}

const MODEL_PROGRESS_RING_RADIUS = 23;
const MODEL_PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * MODEL_PROGRESS_RING_RADIUS;

function ModelProgressCard({
  progress,
  isWorking,
  isSelected,
}: {
  progress: ModelProgress;
  isWorking: boolean;
  isSelected: boolean;
}) {
  const normalizedProgress =
    progress.progress === null
      ? null
      : Math.min(Math.max(Number.isFinite(progress.progress) ? progress.progress : 0, 0), 1);
  const percentage = normalizedProgress === null ? null : Math.round(normalizedProgress * 100);
  const dashOffset =
    normalizedProgress === null
      ? MODEL_PROGRESS_RING_CIRCUMFERENCE * 0.72
      : MODEL_PROGRESS_RING_CIRCUMFERENCE * (1 - normalizedProgress);

  return (
    <li
      className={`${styles.executionNode} ${styles.executionNodeModelProgress} ${isWorking ? styles.executionNodeWorking : ''}`}
      data-card-id="model-progress"
      data-card-selected={isSelected ? 'true' : undefined}
      data-card-working={isWorking ? 'true' : undefined}
    >
      <span className={styles.executionMarker} aria-hidden="true">
        <Icons.Download size={14} />
      </span>
      <article className={`${styles.executionCard} ${styles.modelProgressCard}`} aria-live="polite">
        <div className={styles.modelProgressRingWrap}>
          <div
            className={styles.modelProgressMeter}
            role="progressbar"
            aria-label={`Loading ${progress.modelName}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentage ?? undefined}
            aria-valuetext={percentage === null ? progress.detail : `${percentage}%`}
            tabIndex={0}
          >
            <svg
              className={`${styles.modelProgressRing} ${percentage === null ? styles.modelProgressRingIndeterminate : ''}`}
              viewBox="0 0 58 58"
              aria-hidden="true"
            >
              <circle
                className={styles.modelProgressRingTrack}
                cx="29"
                cy="29"
                r={MODEL_PROGRESS_RING_RADIUS}
              />
              <circle
                className={styles.modelProgressRingValue}
                cx="29"
                cy="29"
                r={MODEL_PROGRESS_RING_RADIUS}
                strokeDasharray={MODEL_PROGRESS_RING_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
              />
              <text className={styles.modelProgressRingText} x="29" y="33" textAnchor="middle">
                {percentage === null ? '···' : `${percentage}%`}
              </text>
            </svg>
          </div>
        </div>
        <div className={styles.modelProgressCopy}>
          <span className={styles.modelProgressEyebrow}>Preparing local model</span>
          <strong>{progress.modelName}</strong>
          <span>{progress.detail}</span>
        </div>
      </article>
    </li>
  );
}

function AgentExecutionMap({
  activity,
  modelProgress,
  timelineExpanded,
  showStepIO,
}: {
  activity: AgentActivityState;
  modelProgress?: ModelProgress;
  timelineExpanded: boolean;
  showStepIO: boolean;
}) {
  const executionMapRef = useRef<HTMLOListElement | null>(null);
  const previousCardRects = useRef(new Map<string, DOMRect>());
  const lastTimelineMode = useRef<boolean | null>(null);
  const cardAnimations = useRef<Animation[]>([]);
  const previousCardListKey = useRef<string | null>(null);
  const previousWorkingCardId = useRef<string | null>(null);
  const previousNavigatedCardId = useRef<string | null>(null);
  const cardIds = useMemo(
    () => [...(modelProgress ? ['model-progress'] : []), ...activity.nodes.map((item) => item.id)],
    [activity.nodes, modelProgress],
  );
  const currentNode = activity.nodes.find((item) => item.id === activity.currentNodeId);
  const activeNode = [...activity.nodes].reverse().find((item) => item.status === 'active');
  const workingCardId =
    (currentNode?.status === 'active' ? currentNode.id : undefined) ??
    activeNode?.id ??
    (modelProgress ? 'model-progress' : null);
  const collapsedCardIds = useMemo(() => {
    const visibleCardIds = cardIds.filter((cardId) => {
      if (cardId === 'model-progress') return true;
      return activity.nodes.find((item) => item.id === cardId)?.status !== 'queued';
    });
    if (!workingCardId || !visibleCardIds.includes(workingCardId)) return visibleCardIds;
    return [...visibleCardIds.filter((cardId) => cardId !== workingCardId), workingCardId];
  }, [activity.nodes, cardIds, workingCardId]);
  const navigationCardIds = timelineExpanded ? cardIds : collapsedCardIds;
  const cardIdKey = navigationCardIds.join('|');
  const defaultCardId =
    (workingCardId && navigationCardIds.includes(workingCardId)
      ? workingCardId
      : navigationCardIds.at(-1)) || null;
  const [selectedCardId, setSelectedCardId] = useState<string | null>(defaultCardId);
  const displayedSelectedCardId =
    previousWorkingCardId.current !== workingCardId ||
    previousCardListKey.current !== cardIdKey ||
    !selectedCardId ||
    !navigationCardIds.includes(selectedCardId)
      ? defaultCardId
      : selectedCardId;
  const selectedCardIndex = displayedSelectedCardId
    ? navigationCardIds.indexOf(displayedSelectedCardId)
    : -1;
  const previousCardDisabled = selectedCardIndex <= 0;
  const nextCardDisabled =
    selectedCardIndex < 0 || selectedCardIndex >= navigationCardIds.length - 1;
  const topCardId =
    displayedSelectedCardId && navigationCardIds.includes(displayedSelectedCardId)
      ? displayedSelectedCardId
      : navigationCardIds.at(-1);
  const topCardIndex = topCardId ? navigationCardIds.indexOf(topCardId) : -1;
  const cardRenderOrder =
    !timelineExpanded && topCardIndex >= 0 ? navigationCardIds.slice(0, topCardIndex + 1) : cardIds;

  useLayoutEffect(() => {
    setSelectedCardId((currentSelectedCardId) => {
      const cardListChanged = previousCardListKey.current !== cardIdKey;
      const workingCardChanged = previousWorkingCardId.current !== workingCardId;
      if (
        cardListChanged ||
        workingCardChanged ||
        !currentSelectedCardId ||
        !navigationCardIds.includes(currentSelectedCardId)
      ) {
        return defaultCardId;
      }
      return currentSelectedCardId;
    });
    previousCardListKey.current = cardIdKey;
    previousWorkingCardId.current = workingCardId ?? null;
  }, [cardIdKey, defaultCardId, navigationCardIds, workingCardId]);

  const moveSelectedCard = (offset: number) => {
    setSelectedCardId((currentSelectedCardId) => {
      const currentIndex = currentSelectedCardId
        ? navigationCardIds.indexOf(currentSelectedCardId)
        : -1;
      const nextIndex = Math.min(Math.max(currentIndex + offset, 0), navigationCardIds.length - 1);
      return navigationCardIds[nextIndex] || currentSelectedCardId;
    });
  };

  useEffect(() => {
    const previousCardId = previousNavigatedCardId.current;
    previousNavigatedCardId.current = displayedSelectedCardId;
    if (
      timelineExpanded ||
      !previousCardId ||
      !displayedSelectedCardId ||
      previousCardId === displayedSelectedCardId ||
      typeof HTMLElement.prototype.animate !== 'function'
    ) {
      return;
    }

    const executionMap = executionMapRef.current;
    if (!executionMap) return;

    const cards = Array.from(executionMap.querySelectorAll<HTMLElement>(':scope > [data-card-id]'));
    const previousIndex = navigationCardIds.indexOf(previousCardId);
    const selectedIndex = navigationCardIds.indexOf(displayedSelectedCardId);
    const incomingCard = cards.find((card) => card.dataset.cardId === displayedSelectedCardId);
    const outgoingCard = cards.find((card) => card.dataset.cardId === previousCardId);
    if (!incomingCard || previousIndex < 0 || selectedIndex < 0) return;

    const direction = selectedIndex > previousIndex ? 1 : -1;
    const incomingAnimation = incomingCard.animate(
      [
        { transform: `translateX(${direction * 42}px) rotate(${direction * 1.4}deg)` },
        { transform: 'translateX(0) rotate(0deg)' },
      ],
      {
        duration: 360,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'both',
      },
    );
    const outgoingAnimation = outgoingCard
      ? outgoingCard.animate(
          [
            { transform: 'translateX(0) rotate(0deg)' },
            { transform: `translateX(${direction * -18}px) rotate(${direction * -0.8}deg)` },
          ],
          {
            duration: 300,
            easing: 'cubic-bezier(0.4, 0, 1, 1)',
            fill: 'both',
          },
        )
      : null;

    const animations = outgoingAnimation
      ? [incomingAnimation, outgoingAnimation]
      : [incomingAnimation];
    cardAnimations.current.push(...animations);
    Promise.all(animations.map((animation) => animation.finished))
      .then(() => {
        for (const animation of animations) animation.cancel();
      })
      .catch(() => undefined);

    return () => {
      for (const animation of animations) animation.cancel();
    };
  }, [displayedSelectedCardId, navigationCardIds, timelineExpanded]);

  useLayoutEffect(() => {
    const executionMap = executionMapRef.current;
    if (!executionMap) return;

    const cards = Array.from(executionMap.querySelectorAll<HTMLElement>(':scope > [data-card-id]'));
    const nextCardRects = new Map(
      cards.map((card) => [card.dataset.cardId || '', card.getBoundingClientRect()]),
    );
    const shouldAnimate =
      lastTimelineMode.current !== null && lastTimelineMode.current !== timelineExpanded;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

    for (const animation of cardAnimations.current) animation.cancel();
    cardAnimations.current = [];

    if (shouldAnimate && !reducedMotion && typeof HTMLElement.prototype.animate === 'function') {
      cards.forEach((card, index) => {
        const cardId = card.dataset.cardId;
        const previousRect = cardId ? previousCardRects.current.get(cardId) : undefined;
        const nextRect = cardId ? nextCardRects.get(cardId) : undefined;
        if (!previousRect || !nextRect) return;

        const deltaX = previousRect.left - nextRect.left;
        const deltaY = previousRect.top - nextRect.top;
        const scaleX = previousRect.width / Math.max(nextRect.width, 1);
        const scaleY = previousRect.height / Math.max(nextRect.height, 1);
        if (
          Math.abs(deltaX) < 1 &&
          Math.abs(deltaY) < 1 &&
          Math.abs(scaleX - 1) < 0.01 &&
          Math.abs(scaleY - 1) < 0.01
        ) {
          return;
        }

        const finalTransform = getComputedStyle(card).transform;
        const animation = card.animate(
          [
            {
              transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY}) ${finalTransform === 'none' ? '' : finalTransform}`,
            },
            { transform: finalTransform },
          ],
          {
            duration: 460,
            delay: Math.min(index * 24, 168),
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            fill: 'both',
          },
        );
        cardAnimations.current.push(animation);
        animation.finished.then(() => animation.cancel()).catch(() => undefined);
      });
    }

    previousCardRects.current = nextCardRects;
    lastTimelineMode.current = timelineExpanded;
  }, [timelineExpanded]);

  useLayoutEffect(() => {
    if (!timelineExpanded || !workingCardId) return;

    const executionMap = executionMapRef.current;
    if (!executionMap) return;

    const cards = Array.from(executionMap.querySelectorAll<HTMLElement>(':scope > [data-card-id]'));
    const workingCard = cards.find((card) => card.dataset.cardId === workingCardId);
    if (
      !workingCard ||
      executionMap.clientWidth <= 0 ||
      executionMap.scrollWidth <= executionMap.clientWidth
    ) {
      return;
    }

    const mapRect = executionMap.getBoundingClientRect();
    const cardRect = workingCard.getBoundingClientRect();
    const maxScrollLeft = executionMap.scrollWidth - executionMap.clientWidth;
    const centeredScrollLeft =
      executionMap.scrollLeft +
      (cardRect.left - mapRect.left) -
      (executionMap.clientWidth - cardRect.width) / 2;
    const nextScrollLeft = Math.min(Math.max(centeredScrollLeft, 0), maxScrollLeft);
    if (Math.abs(nextScrollLeft - executionMap.scrollLeft) < 1) return;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    executionMap.scrollTo({ left: nextScrollLeft, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [timelineExpanded, workingCardId]);

  useEffect(
    () => () => {
      for (const animation of cardAnimations.current) animation.cancel();
    },
    [],
  );

  const renderCard = (cardId: string) => {
    if (cardId === 'model-progress' && modelProgress) {
      return (
        <ModelProgressCard
          key={cardId}
          progress={modelProgress}
          isWorking={workingCardId === cardId}
          isSelected={displayedSelectedCardId === cardId}
        />
      );
    }

    const itemIndex = activity.nodes.findIndex((item) => item.id === cardId);
    const item = itemIndex >= 0 ? activity.nodes[itemIndex] : undefined;
    if (!item) return null;

    return (
      <ActivityNode
        key={item.id}
        item={item}
        index={itemIndex}
        isCurrent={item.id === workingCardId}
        isWorking={item.id === workingCardId}
        isSelected={item.id === displayedSelectedCardId}
        showStepIO={showStepIO}
      />
    );
  };

  return (
    <section className={styles.executionSection} aria-label="Execution timeline">
      <div
        className={`${styles.executionDeck} ${timelineExpanded ? styles.executionDeckExpanded : styles.executionDeckCollapsed}`}
      >
        {!timelineExpanded ? (
          <Tooltip content="Previous card" className={styles.deckNavTooltip}>
            <button
              type="button"
              className={styles.deckNavButton}
              aria-label="Previous timeline card"
              disabled={previousCardDisabled}
              onClick={() => moveSelectedCard(-1)}
            >
              <Icons.ChevronLeft size={18} />
            </button>
          </Tooltip>
        ) : null}
        <ol
          ref={executionMapRef}
          className={`${styles.executionMap} ${timelineExpanded ? styles.executionMapExpanded : styles.executionMapCollapsed}`}
          aria-label={
            timelineExpanded ? 'Expanded execution cards' : 'Collapsed execution card deck'
          }
        >
          {cardRenderOrder.map(renderCard)}
        </ol>
        {!timelineExpanded ? (
          <Tooltip content="Next card" className={styles.deckNavTooltip}>
            <button
              type="button"
              className={styles.deckNavButton}
              aria-label="Next timeline card"
              disabled={nextCardDisabled}
              onClick={() => moveSelectedCard(1)}
            >
              <Icons.ChevronRight size={18} />
            </button>
          </Tooltip>
        ) : null}
      </div>
    </section>
  );
}

function VisualReasoning({
  activeSession,
  activity,
  modelProgress,
  timelineExpanded,
  runUsageSummary,
  latestError,
  fallbackContent,
  showStepIO,
}: {
  activeSession: AgentSession | null;
  activity: AgentActivityState;
  modelProgress?: ModelProgress;
  timelineExpanded: boolean;
  runUsageSummary: string;
  latestError: string;
  fallbackContent: string;
  showStepIO: boolean;
}) {
  const hasMap = activity.nodes.length > 0;
  const hasContent = hasMap || Boolean(runUsageSummary) || Boolean(modelProgress);

  return (
    <>
      <RunOverview
        activeSession={activeSession}
        activity={activity}
        latestError={latestError}
        hasContent={hasContent}
      />
      {hasMap || modelProgress ? (
        <AgentExecutionMap
          activity={activity}
          modelProgress={modelProgress}
          timelineExpanded={timelineExpanded}
          showStepIO={showStepIO}
        />
      ) : null}
      {runUsageSummary ? (
        <details className={styles.visualRunDetails}>
          <summary>Run details</summary>
          <div className={styles.visualRunDetailsContent}>
            <ReactMarkdown components={summaryMarkdownComponents}>{runUsageSummary}</ReactMarkdown>
          </div>
        </details>
      ) : null}
      {latestError ? (
        <aside className={styles.reasoningError} role="alert">
          <strong className={styles.reasoningErrorLabel}>Latest error</strong>
          <span>{latestError}</span>
        </aside>
      ) : null}
      {!hasContent && !latestError ? (
        <section className={styles.emptyVisualState}>
          <span className={styles.emptyVisualIcon} aria-hidden="true">
            ·
          </span>
          <p>{fallbackContent}</p>
        </section>
      ) : null}
    </>
  );
}

function ReasoningGroups({ groups }: { groups: ReasoningGroup[] }) {
  return (
    <>
      {groups.map((group, groupIndex) => (
        <section className={styles.reasoningGroup} key={`${group.step}-${groupIndex}`}>
          {group.step !== null ? <h2 className={styles.stepHeading}>Step {group.step}</h2> : null}
          {keyReasoningEntries(group.entries).map((entry) => (
            <article className={styles.reasoningEntry} key={entry.renderKey}>
              {entry.timestamp ? <time className={styles.timestamp}>{entry.timestamp}</time> : null}
              <div className={styles.reasoningText}>
                <ReactMarkdown components={markdownComponents}>{entry.text}</ReactMarkdown>
              </div>
            </article>
          ))}
        </section>
      ))}
    </>
  );
}

export default function AISectionReasoning({
  activeSession,
  reasoningGroups,
  visualReasoningGroups = reasoningGroups,
  activity,
  modelProgress,
  timelineExpanded = false,
  viewType = 'visual',
  showStepIO = false,
  runUsageSummary,
  latestError = '',
  fallbackContent,
  content,
  contentRef,
  autoScroll = true,
  onUserScroll,
}: AISectionReasoningProps) {
  const transcriptMessages = withoutManagerErrorMessages(activeSession?.messages || []);
  const hasTranscript = transcriptMessages.length > 0;
  const lastScrollTop = useRef(0);
  const visualActivity =
    activity ||
    applyReasoningFallback(
      transcriptMessages.find((message) => message.role === 'user')?.text || '',
      visualReasoningGroups.flatMap((group) => group.entries),
      activeSession?.status || 'idle',
    );

  const handleScroll = () => {
    const contentElement = contentRef.current;
    if (!contentElement) return;

    const { scrollTop, scrollHeight, clientHeight } = contentElement;
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10;

    if (isAtBottom) {
      onUserScroll?.(true);
    } else if (scrollTop < lastScrollTop.current && autoScroll) {
      onUserScroll?.(false);
    }
    lastScrollTop.current = scrollTop;
  };

  useEffect(() => {
    if (!autoScroll || !content || !contentRef.current) return;
    contentRef.current.scrollTo({
      top: contentRef.current.scrollHeight,
      behavior: 'auto',
    });
  }, [autoScroll, content, contentRef]);

  const visual = viewType === 'visual';

  return (
    <div
      ref={contentRef}
      className={`${styles.content} ${styles.markdownContent} ${visual ? styles.visualContent : ''}`}
      onScroll={handleScroll}
    >
      {visual ? (
        <VisualReasoning
          activeSession={activeSession}
          activity={visualActivity}
          modelProgress={modelProgress}
          timelineExpanded={timelineExpanded}
          runUsageSummary={runUsageSummary}
          latestError={latestError}
          fallbackContent={fallbackContent}
          showStepIO={showStepIO}
        />
      ) : (
        <>
          {hasTranscript ? <Transcript messages={transcriptMessages} /> : null}
          <ReasoningGroups groups={reasoningGroups} />
          {runUsageSummary ? (
            <section className={styles.runSummary}>
              <ReactMarkdown components={summaryMarkdownComponents}>
                {runUsageSummary}
              </ReactMarkdown>
            </section>
          ) : null}
          {latestError ? (
            <aside className={styles.reasoningError} role="alert">
              <strong className={styles.reasoningErrorLabel}>Latest error</strong>
              <span>{latestError}</span>
            </aside>
          ) : null}
          {!reasoningGroups.length && !runUsageSummary && !hasTranscript && !latestError ? (
            <section className={styles.reasoningGroup}>
              <article className={styles.reasoningEntry}>
                <div className={styles.reasoningText}>{fallbackContent}</div>
              </article>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
