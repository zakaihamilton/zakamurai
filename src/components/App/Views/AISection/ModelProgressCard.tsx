import { Icons } from '@/components/ui/Icons';
import type { ModelProgress } from './AISectionReasoningUtils';
import styles from './ModelProgressCard.module.css';

const MODEL_PROGRESS_RING_RADIUS = 23;

const MODEL_PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * MODEL_PROGRESS_RING_RADIUS;

export default function ModelProgressCard({
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
