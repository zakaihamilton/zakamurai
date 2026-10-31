import type { AgentActivityState, AgentSession } from '@/types/domain-types';
import ReactMarkdown from 'react-markdown';
import type { ModelProgress } from './AISectionReasoningUtils';
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
  const hasContent = hasMap || Boolean(runUsageSummary) || Boolean(modelProgress);

  return (
    <>
      <RunOverview
        activeSession={activeSession}
        activity={displayActivity}
        latestError={latestError}
        hasContent={hasContent}
      />
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
          <summary>Run details</summary>
          <div className={styles.visualRunDetailsContent}>
            <ReactMarkdown components={summaryMarkdownComponents}>
              {displayRunUsageSummary}
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
