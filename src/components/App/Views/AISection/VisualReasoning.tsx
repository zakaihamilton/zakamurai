import { formatDuration } from '@/components/AI/Agent/formatDuration';
import { Icons } from '@/components/ui/Icons';
import type { AgentActivityState, AgentSession } from '@/types/domain-types';
import ReactMarkdown from 'react-markdown';
import {
  type ModelProgress,
  type ReasoningViewType,
  getRecentMilestones,
} from './AISectionReasoningUtils';
import ExecutionTimeline from './ExecutionTimeline';
import { summaryMarkdownComponents } from './ReasoningMarkdown';
import RunOverview from './RunOverview';
import styles from './VisualReasoning.module.css';

const reconcileValidationClaim = (
  text: string,
  validationStatus: 'passed' | 'failed' | 'unavailable' | undefined,
): string => {
  if (validationStatus === 'passed' || !/\bvalidated the build\b/i.test(text)) return text;

  const validationNote =
    validationStatus === 'failed' ? 'validation failed' : 'validation status was unavailable';
  return text
    .replace(/\s+and\s+(?:successfully\s+)?validated the build\b/gi, `; ${validationNote}`)
    .replace(/\b(?:successfully\s+)?validated the build\b/gi, validationNote)
    .replace(/^\s*[;,]\s*/, '');
};

const formatMilestoneTimestamp = (item: AgentActivityState['nodes'][number]): string => {
  if (typeof item.elapsedMs !== 'number' || !Number.isFinite(item.elapsedMs))
    return item.timestamp;

  const elapsedMs = Math.max(0, Math.floor(item.elapsedMs));
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = elapsedMs % 1000;
  const paddedSeconds = String(seconds).padStart(2, '0');
  const paddedMilliseconds = String(milliseconds).padStart(3, '0');
  return `+${minutes}m ${paddedSeconds}.${paddedMilliseconds}s`;
};

const RunMetrics = ({
  activity,
  activeSession,
}: {
  activity: AgentActivityState;
  activeSession: AgentSession | null;
}) => {
  const usage = activeSession?.runUsage;
  const toolCount = Object.values(usage?.toolCalls || {}).reduce(
    (total, count) => total + count,
    0,
  );
  const duration = activity.durationMs || usage?.totalMs || 0;
  const hasMetrics = Boolean(usage && (usage.modelCalls > 0 || toolCount > 0 || duration > 0));
  if (!hasMetrics) return null;

  const validationNode = activity.nodes.find((item) => item.phase === 'validation');
  const validationLabel =
    usage?.finalValidationStatus === 'passed'
      ? 'Passed'
      : usage?.finalValidationStatus === 'failed'
        ? 'Failed'
        : validationNode?.status === 'active'
          ? 'In progress'
          : validationNode?.status === 'queued'
            ? 'Pending'
            : 'Not run';

  return (
    <section className={styles.activityMetrics} aria-label="Run metrics">
      <dl>
        <div>
          <dt>Model calls</dt>
          <dd>{usage?.modelCalls || 0}</dd>
        </div>
        <div>
          <dt>Tool calls</dt>
          <dd>{toolCount}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{formatDuration(duration)}</dd>
        </div>
        <div>
          <dt>Validation</dt>
          <dd>{validationLabel}</dd>
        </div>
      </dl>
    </section>
  );
};

const ActivityDetailsView = ({
  activity,
  activeSession,
  modelProgress,
  timelineExpanded,
  onToggleTimeline,
  onToggleStepIO,
  runUsageSummary,
  latestError,
  showStepIO,
}: {
  activity: AgentActivityState;
  activeSession: AgentSession | null;
  modelProgress?: ModelProgress;
  timelineExpanded: boolean;
  onToggleTimeline: () => void;
  onToggleStepIO: () => void;
  runUsageSummary: string;
  latestError: string;
  showStepIO: boolean;
}) => {
  const hasTimeline = activity.nodes.length > 0 || Boolean(modelProgress);
  const usage = activeSession?.runUsage;
  const toolCount = Object.values(usage?.toolCalls || {}).reduce(
    (total, count) => total + count,
    0,
  );
  const hasRunMetrics = Boolean(
    usage && (usage.modelCalls > 0 || toolCount > 0 || activity.durationMs > 0),
  );
  const hasDetails =
    hasTimeline || hasRunMetrics || Boolean(runUsageSummary) || Boolean(latestError);

  return (
    <section className={styles.activityDetailsView} aria-label="Activity details">
      <div className={styles.activityDetailsPanel}>
        {hasTimeline ? (
          <>
            <div className={styles.activityDetailsActions}>
              <button
                className={styles.activityDetailsAction}
                type="button"
                aria-pressed={timelineExpanded}
                onClick={onToggleTimeline}
              >
                {timelineExpanded ? <Icons.Columns size={15} /> : <Icons.Grid size={15} />}
                <span>
                  {timelineExpanded ? 'Collapse timeline cards' : 'Expand timeline cards'}
                </span>
              </button>
              <button
                className={styles.activityDetailsAction}
                type="button"
                aria-pressed={showStepIO}
                onClick={onToggleStepIO}
              >
                <Icons.Terminal size={15} />
                <span>{showStepIO ? 'Hide input / output' : 'Show input / output'}</span>
              </button>
            </div>
            <ExecutionTimeline
              activity={activity}
              modelProgress={modelProgress}
              timelineExpanded={timelineExpanded}
              showStepIO={showStepIO}
            />
          </>
        ) : null}

        <RunMetrics activity={activity} activeSession={activeSession} />

        {runUsageSummary ? (
          <details className={styles.visualRunDetails}>
            <summary>Completed run summary</summary>
            <div className={styles.visualRunDetailsContent}>
              <ReactMarkdown components={summaryMarkdownComponents}>
                {runUsageSummary}
              </ReactMarkdown>
            </div>
          </details>
        ) : null}

        {latestError ? (
          <aside className={styles.reasoningError} role="alert">
            <strong className={styles.reasoningErrorLabel}>Latest error</strong>
            <span>{latestError}</span>
          </aside>
        ) : null}

        {!hasDetails ? (
          <p className={styles.activityDetailsEmpty}>
            Activity details will appear when a run starts.
          </p>
        ) : null}
      </div>
    </section>
  );
};

export default function VisualReasoning({
  activeSession,
  activity,
  modelProgress,
  viewType,
  timelineExpanded,
  onToggleTimeline,
  onToggleStepIO,
  runUsageSummary,
  latestError,
  showStepIO,
}: {
  activeSession: AgentSession | null;
  activity: AgentActivityState;
  modelProgress?: ModelProgress;
  viewType: Exclude<ReasoningViewType, 'text'>;
  timelineExpanded: boolean;
  onToggleTimeline: () => void;
  onToggleStepIO: () => void;
  runUsageSummary: string;
  latestError: string;
  showStepIO: boolean;
}) {
  const validationStatus = activeSession?.runUsage?.finalValidationStatus;
  const displayActivity =
    validationStatus === 'passed'
      ? activity
      : {
          ...activity,
          nodes: activity.nodes.map((node) => {
            if (node.kind !== 'result') return node;
            const detail = reconcileValidationClaim(node.detail, validationStatus);
            return detail === node.detail ? node : { ...node, detail };
          }),
        };
  const displayRunUsageSummary = reconcileValidationClaim(runUsageSummary, validationStatus);
  const hasMap = displayActivity.nodes.length > 0;
  const hasRunContent = hasMap || Boolean(runUsageSummary);
  const milestones = getRecentMilestones(displayActivity);

  if (viewType === 'activity') {
    return (
      <ActivityDetailsView
        activity={displayActivity}
        activeSession={activeSession}
        modelProgress={modelProgress}
        timelineExpanded={timelineExpanded}
        onToggleTimeline={onToggleTimeline}
        onToggleStepIO={onToggleStepIO}
        runUsageSummary={displayRunUsageSummary}
        latestError={latestError}
        showStepIO={showStepIO}
      />
    );
  }

  return (
    <>
      <RunOverview
        activeSession={activeSession}
        activity={displayActivity}
        latestError={latestError}
        hasContent={hasRunContent}
        modelProgress={modelProgress}
      />

      {milestones.length ? (
        <section className={styles.recentMilestones} aria-label="Recent milestones">
          <h2>Recent milestones</h2>
          <ol className={styles.milestoneList}>
            {milestones.map((item) => {
              const timestamp = formatMilestoneTimestamp(item);
              return (
                <li className={styles.milestone} key={item.id}>
                  <span className={styles.milestoneIcon} aria-hidden="true">
                    <Icons.Check size={13} />
                  </span>
                  <div className={styles.milestoneCopy}>
                    <strong>{item.label}</strong>
                    {item.detail && item.detail !== item.label ? <p>{item.detail}</p> : null}
                  </div>
                  {timestamp ? <span className={styles.milestoneTime}>{timestamp}</span> : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {latestError ? (
        <aside className={styles.reasoningError} role="alert">
          <strong className={styles.reasoningErrorLabel}>Latest error</strong>
          <span>{latestError}</span>
        </aside>
      ) : null}
    </>
  );
}
