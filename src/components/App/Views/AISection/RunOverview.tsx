import { Icons } from '@/components/ui/Icons';
import type {
  AgentActivityNode,
  AgentActivityPhase,
  AgentActivityState,
  AgentSession,
} from '@/types/domain-types';
import {
  type DisplayRunStatus,
  type ModelProgress,
  getActivityRunStatus,
  getNextActivityNode,
  getProgressRoadmap,
  nodeDetail,
} from './AISectionReasoningUtils';
import styles from './RunOverview.module.css';

const statusLabels: Record<DisplayRunStatus, string> = {
  waiting: 'Waiting',
  running: 'Working',
  ready: 'Ready',
  error: 'Error',
  stopped: 'Stopped',
};

const phaseFallbacks: Record<AgentActivityPhase, string> = {
  request: 'Reading your request',
  routing: 'Preparing the run',
  context: 'Gathering workspace context',
  work: 'Working through the plan',
  validation: 'Validating changes',
  recovery: 'Recovering the model',
  result: 'Preparing the result',
};

const getCurrentNode = (activity: AgentActivityState): AgentActivityNode | undefined =>
  activity.nodes.find((item) => item.id === activity.currentNodeId) ||
  activity.nodes.find((item) => item.status === 'active');

const getFailedNode = (activity: AgentActivityState): AgentActivityNode | undefined =>
  activity.nodes.find((item) => item.status === 'failed' && item.phase !== 'result');

const renderLiveDetail = (detail: string) => {
  const match = detail.match(/streaming its next action \(([,\d]+)(?= character\(s\) received)/);
  if (!match || match.index === undefined) return detail;

  const count = match[1];
  const countStart = match.index + match[0].length - count.length;
  return (
    <>
      {detail.slice(0, countStart)}
      <span className={styles.streamingCharacterCount}>{count}</span>
      {detail.slice(countStart + count.length)}
    </>
  );
};

export default function RunOverview({
  activeSession,
  activity,
  latestError,
  hasContent,
  modelProgress,
}: {
  activeSession: AgentSession | null;
  activity: AgentActivityState;
  latestError: string;
  hasContent: boolean;
  modelProgress?: ModelProgress;
}) {
  const status = getActivityRunStatus(activity, activeSession, latestError, hasContent);
  const isEmptyState =
    status === 'waiting' &&
    !hasContent &&
    !modelProgress &&
    activity.nodes.length === 0 &&
    !activity.request;
  const progressStages = getProgressRoadmap(activity).map((stage, index) =>
    status === 'running' && activity.nodes.length === 0 && index === 0
      ? { ...stage, status: 'active' as const }
      : stage,
  );
  const existingFailureIndex = progressStages.findIndex((stage) => stage.status === 'failed');
  const activeStageIndex = progressStages.findIndex((stage) => stage.status === 'active');
  const failedStageIndex =
    existingFailureIndex >= 0
      ? existingFailureIndex
      : activeStageIndex >= 0
        ? activeStageIndex
        : progressStages.length - 1;
  const roadmap = progressStages.map((stage, index) =>
    status === 'error' && index === failedStageIndex
      ? { ...stage, status: 'failed' as const }
      : stage,
  );
  const progressStageIndex = roadmap.reduce(
    (lastIndex, stage, index) =>
      stage.status === 'completed' || stage.status === 'active' || stage.status === 'failed'
        ? index
        : lastIndex,
    -1,
  );
  const currentNode = getCurrentNode(activity);
  const failedNode = getFailedNode(activity);
  const resultNode = activity.nodes.find((item) => item.phase === 'result');
  const nextNode = getNextActivityNode(activity);
  const currentStageIndex = roadmap.findIndex((stage) => stage.status === 'active');
  const nextStage = roadmap.find(
    (stage, index) => index > currentStageIndex && stage.status === 'upcoming',
  );
  const isPreparingModel = status === 'waiting' && Boolean(modelProgress);
  const liveLabel = isPreparingModel
    ? 'Preparing local model'
    : status === 'running'
      ? 'Working now'
      : status === 'ready'
        ? 'Final result'
        : status === 'error'
          ? 'Run stopped'
          : status === 'stopped'
            ? 'Run stopped'
            : isEmptyState
              ? 'Ready when you are'
              : 'Waiting to start';

  const currentTitle =
    isPreparingModel && modelProgress
      ? modelProgress.modelName
      : status === 'running'
        ? currentNode?.label ||
          (activity.currentPhase ? phaseFallbacks[activity.currentPhase] : 'Preparing the task')
        : status === 'ready'
          ? 'Run complete'
          : status === 'error'
            ? failedNode?.label || 'Run stopped'
            : status === 'stopped'
              ? 'Run stopped'
              : isEmptyState
                ? 'Start with a task'
                : 'Waiting for a run';

  const currentDetail =
    isPreparingModel && modelProgress
      ? modelProgress.detail
      : status === 'running'
        ? (currentNode ? nodeDetail(currentNode) : '') ||
          (activity.currentPhase ? phaseFallbacks[activity.currentPhase] : 'Starting the run.')
        : status === 'ready'
          ? (resultNode ? nodeDetail(resultNode) : '') || 'The run is complete.'
          : status === 'error'
            ? latestError ||
              (failedNode ? nodeDetail(failedNode) : '') ||
              'The run stopped with an error.'
            : status === 'stopped'
              ? 'The run was stopped before it finished.'
              : isEmptyState
                ? 'Message the AI Manager and your progress will appear here as it runs.'
                : 'Start a task to see live progress here.';

  const nextLabel = nextNode
    ? nextNode.phase === 'result'
      ? 'Prepare the result'
      : nextNode.label
    : status === 'running'
      ? nextStage?.label || ''
      : '';
  const percentage =
    modelProgress?.progress === null || modelProgress?.progress === undefined
      ? null
      : Math.round(Math.min(Math.max(modelProgress.progress, 0), 1) * 100);
  const announcement =
    status === 'running'
      ? `Working on ${currentTitle}${nextLabel ? `. Up next: ${nextLabel}.` : '.'}`
      : isPreparingModel
        ? `Preparing local model: ${modelProgress?.modelName}.`
        : `Run status: ${statusLabels[status]}.`;

  return (
    <section
      className={styles.runOverview}
      data-empty={isEmptyState || undefined}
      aria-label="Run overview"
    >
      <div className={styles.overviewHeading}>
        <div className={styles.runStatus} data-status={status}>
          <span className={styles.statusMarker} aria-hidden="true" />
          <span className={styles.runStatusLabel}>Run status</span>
          <strong>{isPreparingModel ? 'Preparing model' : statusLabels[status]}</strong>
        </div>
        {activity.request ? (
          <p className={styles.runRequest}>
            <span>Request</span>
            {activity.request}
          </p>
        ) : null}
      </div>

      {!isEmptyState ? (
        <ol
          className={styles.roadmap}
          aria-label="Run stages"
          data-progress-stage={progressStageIndex}
          data-progress-error={roadmap.some((stage) => stage.status === 'failed') || undefined}
        >
          {roadmap.map((stage) => (
            <li
              className={styles.roadmapStage}
              data-stage-status={stage.status}
              aria-current={stage.status === 'active' ? 'step' : undefined}
              key={stage.id}
            >
              <span className={styles.roadmapMarker} aria-hidden="true">
                {stage.status === 'completed' ? <Icons.Check size={14} /> : null}
                {stage.status === 'failed' ? <Icons.AlertCircle size={14} /> : null}
              </span>
              <span className={styles.roadmapLabel}>{stage.label}</span>
              <span className={styles.screenReaderOnly}>{stage.status}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <section className={styles.liveExecution} aria-label="Live execution">
        <div className={styles.liveHeader}>
          <span className={styles.liveIndicator} data-status={status} aria-hidden="true" />
          <span className={styles.liveLabel}>{liveLabel}</span>
        </div>
        <h2 className={styles.liveTitle}>{currentTitle}</h2>
        <p className={styles.liveDetail}>{renderLiveDetail(currentDetail)}</p>
        {modelProgress ? (
          <div className={styles.modelProgress}>
            <progress
              className={styles.modelProgressBar}
              max={1}
              value={percentage === null ? undefined : percentage / 100}
              aria-label={`Loading ${modelProgress.modelName}`}
            />
            {percentage !== null ? <span>{percentage}% downloaded</span> : null}
          </div>
        ) : null}
        {status === 'running' && nextLabel ? (
          <div className={styles.nextSummary}>
            <strong>Up next</strong>
            <span aria-hidden="true">·</span>
            <span>{nextLabel}</span>
          </div>
        ) : null}
      </section>

      <output className={styles.screenReaderOnly} aria-live="polite" aria-atomic="true">
        {announcement}
      </output>
    </section>
  );
}
