import { formatDuration } from '@/components/AI/Agent/formatDuration';
import { Icons } from '@/components/ui/Icons';
import type { AgentActivityNode, AgentActivityNodeKind } from '@/types/domain-types';
import { nodeDetail, parseGenerationProgress, statusLabels } from './AISectionReasoningUtils';
import styles from './ExecutionActivityCard.module.css';

const activityIcons: Record<AgentActivityNodeKind, typeof Icons.AIPrompt> = {
  request: Icons.AIPrompt,
  milestone: Icons.Brain,
  tool: Icons.Terminal,
  model: Icons.Sparkles,
  validation: Icons.Check,
  recovery: Icons.Refresh,
  result: Icons.Check,
};

const isLiveGenerationNode = (item: AgentActivityNode): boolean =>
  item.kind === 'model' && item.task === 'generate-changes' && item.status === 'active';

export default function ActivityNode({
  item,
  index,
  isCurrent,
  isWorking,
  isSelected,
  isHiddenFromAccessibility,
  showStepIO,
}: {
  item: AgentActivityNode;
  index: number;
  isCurrent: boolean;
  isWorking: boolean;
  isSelected: boolean;
  isHiddenFromAccessibility: boolean;
  showStepIO: boolean;
}) {
  const ActivityIcon = activityIcons[item.kind];
  const isLiveGeneration = isLiveGenerationNode(item);
  const generationProgress = isLiveGeneration ? parseGenerationProgress(item.detail) : null;
  const detail = nodeDetail(item);
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
      aria-hidden={isHiddenFromAccessibility || undefined}
      inert={isHiddenFromAccessibility}
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
              <fieldset className={styles.executionGenerationSummary}>
                <legend className={styles.executionGenerationLegend}>Generation progress</legend>
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
                  <output className={styles.executionGenerationWaitText} aria-atomic="true">
                    {generationProgress?.waitingLabel}
                  </output>
                </div>
              </fieldset>
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
            <p className={styles.executionDetail}>{detail}</p>
          )}
          {item.status === 'queued' && item.reason && !detail.includes(item.reason) ? (
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
