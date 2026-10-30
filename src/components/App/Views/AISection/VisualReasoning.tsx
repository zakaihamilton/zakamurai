import type { AgentActivityState, AgentSession } from '@/types/domain-types';
import ReactMarkdown from 'react-markdown';
import { summaryMarkdownComponents } from './ReasoningMarkdown';
import RunOverview from './RunOverview';
import ExecutionTimeline from './ExecutionTimeline';
import type { ModelProgress } from './AISectionReasoningUtils';
import styles from './VisualReasoning.module.css';

export default function VisualReasoning({
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
        <ExecutionTimeline
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
