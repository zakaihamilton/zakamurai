import { formatDuration } from '@/components/AI/Agent/formatDuration';
import Tooltip from '@/components/ui/Tooltip';
import type { AgentActivityState, AgentSession } from '@/types/domain-types';
import {
  type DisplayRunStatus,
  getActivityRunStatus,
  getLiveExecutionInfo,
} from './AISectionReasoningUtils';
import styles from './RunOverview.module.css';

export default function RunOverview({
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
          {activity?.request ? (
            <Tooltip content={activity.request} className={styles.runTextTooltip}>
              <span className={styles.runRequest}>{activity.request}</span>
            </Tooltip>
          ) : null}
        </div>
      </div>
      <section className={styles.runExecution} aria-label="Live execution">
        <span
          className={`${styles.runExecutionIndicator} ${styles[`runExecutionIndicator${liveExecution.tone}`]}`}
          aria-hidden="true"
        />
        <div className={styles.runExecutionCopy}>
          <Tooltip content={liveExecution.title} className={styles.runTextTooltip}>
            <strong className={styles.runExecutionTitle}>{liveExecution.title}</strong>
          </Tooltip>
          {liveExecution.detail ? (
            <Tooltip content={liveExecution.detail} className={styles.runTextTooltip}>
              <span className={styles.runExecutionDetail}>{liveExecution.detail}</span>
            </Tooltip>
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
