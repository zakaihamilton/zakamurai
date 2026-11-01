import { formatDuration } from '@/components/AI/Agent/formatDuration';
import { Icons } from '@/components/ui/Icons';
import type { AgentActivityState, AgentSession } from '@/types/domain-types';
import ReactMarkdown from 'react-markdown';
import { type ModelProgress, getRecentMilestones } from './AISectionReasoningUtils';
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

export default function VisualReasoning({
  activeSession,
  activity,
  modelProgress,
  timelineExpanded,
  activityDetailsOpen,
  onToggleActivityDetails,
  onToggleTimeline,
  onToggleStepIO,
  runUsageSummary,
  latestError,
  showStepIO,
}: {
  activeSession: AgentSession | null;
  activity: AgentActivityState;
  modelProgress?: ModelProgress;
  timelineExpanded: boolean;
  activityDetailsOpen: boolean;
  onToggleActivityDetails: () => void;
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
  const usage = activeSession?.runUsage;
  const toolCount = Object.values(usage?.toolCalls || {}).reduce(
    (total, count) => total + count,
    0,
  );
  const hasRunMetrics = Boolean(
    usage && (usage.modelCalls > 0 || toolCount > 0 || displayActivity.durationMs > 0),
  );
  const showActivityDetails =
    hasMap || Boolean(modelProgress) || hasRunMetrics || Boolean(displayRunUsageSummary);

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
            {milestones.map((item) => (
              <li className={styles.milestone} key={item.id}>
                <span className={styles.milestoneIcon} aria-hidden="true">
                  <Icons.Check size={13} />
                </span>
                <div className={styles.milestoneCopy}>
                  <strong>{item.label}</strong>
                  {item.detail && item.detail !== item.label ? <p>{item.detail}</p> : null}
                </div>
                {item.timestamp ? (
                  <span className={styles.milestoneTime}>{item.timestamp}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {showActivityDetails ? (
        <section className={styles.activityDetails} aria-label="Activity details">
          <button
            className={styles.activityDetailsToggle}
            type="button"
            aria-expanded={activityDetailsOpen}
            aria-controls={activityDetailsOpen ? 'activity-details-panel' : undefined}
            onClick={onToggleActivityDetails}
          >
            <span>Activity details</span>
            <Icons.ChevronDown size={16} />
          </button>
          {activityDetailsOpen ? (
            <div className={styles.activityDetailsPanel} id="activity-details-panel">
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

              <RunMetrics activity={displayActivity} activeSession={activeSession} />

              {hasMap || modelProgress ? (
                <ExecutionTimeline
                  activity={displayActivity}
                  modelProgress={modelProgress}
                  timelineExpanded={timelineExpanded}
                  showStepIO={showStepIO}
                />
              ) : null}

              {displayRunUsageSummary ? (
                <details className={styles.visualRunDetails}>
                  <summary>Completed run summary</summary>
                  <div className={styles.visualRunDetailsContent}>
                    <ReactMarkdown components={summaryMarkdownComponents}>
                      {displayRunUsageSummary}
                    </ReactMarkdown>
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}
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
