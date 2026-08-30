import { withoutManagerErrorMessages } from '@/components/App/Panes/Prompt/AgentSessions';
import type { AgentReasoningEntry, AgentSession, AgentSessionMessage } from '@/types/domain-types';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import styles from './AISectionReasoning.module.css';

export type ReasoningGroup = { step: number | null; entries: AgentReasoningEntry[] };
export type ReasoningViewType = 'visual' | 'text';

export const normalizeReasoningViewType = (value: string | undefined): ReasoningViewType =>
  value === 'text' ? 'text' : 'visual';

type AISectionReasoningProps = {
  activeSession: AgentSession | null;
  reasoningGroups: ReasoningGroup[];
  visualReasoningGroups?: ReasoningGroup[];
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

function Transcript({
  messages,
  visual = false,
}: {
  messages: AgentSessionMessage[];
  visual?: boolean;
}) {
  return (
    <section
      className={`${styles.transcriptSection} ${visual ? styles.visualTranscript : ''}`}
      aria-label="Session transcript"
    >
      {visual ? <h2 className={styles.visualSectionHeading}>Conversation</h2> : null}
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

function RunOverview({
  activeSession,
  latestError,
  hasContent,
}: {
  activeSession: AgentSession | null;
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
  const status = getRunStatus(activeSession, latestError, hasContent);
  const statusLabels = {
    waiting: 'Waiting',
    running: 'Working',
    ready: 'Ready',
    error: 'Error',
  } as const;

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
        </div>
      </div>
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
            <dd>{formatDuration(runUsage?.totalMs || 0)}</dd>
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

function ReasoningTimeline({
  groups,
  showStepIO,
  isRunning,
}: {
  groups: ReasoningGroup[];
  showStepIO: boolean;
  isRunning: boolean;
}) {
  if (!groups.length) return null;

  const lastGroupIndex = groups.length - 1;
  return (
    <section className={styles.timelineSection} aria-label="Reasoning timeline">
      <h2 className={styles.visualSectionHeading}>Agent timeline</h2>
      <ol className={styles.timeline}>
        {groups.map((group, groupIndex) => {
          const status = getReasoningGroupStatus(group, groupIndex === lastGroupIndex, isRunning);
          const firstEntry = group.entries[0];
          const groupTitle = (firstEntry && extractReasoningLabel(firstEntry.text)) || 'Progress';

          return (
            <li
              key={`${group.step}-${groupIndex}`}
              className={`${styles.timelineItem} ${styles[`timelineItem${status}`]}`}
            >
              <span className={styles.timelineMarker} aria-hidden="true" />
              <article className={styles.timelineCard}>
                <header className={styles.timelineHeader}>
                  <div className={styles.timelineTitleGroup}>
                    <span className={styles.timelineTitle}>{groupTitle}</span>
                    {group.step !== null ? (
                      <span className={styles.timelineStep}>Step {group.step}</span>
                    ) : null}
                  </div>
                  <span className={styles.timelineStatus}>{status}</span>
                </header>
                <div className={styles.timelineEntries}>
                  {keyReasoningEntries(group.entries).map((entry, entryIndex) => {
                    const phase = extractReasoningLabel(entry.text);
                    const body = stripReasoningLabel(entry.text) || entry.text;
                    return (
                      <div className={styles.timelineEntry} key={entry.renderKey}>
                        <div className={styles.timelineEntryMeta}>
                          {phase && phase !== groupTitle ? (
                            <span className={styles.timelinePhase}>{phase}</span>
                          ) : null}
                          {entry.timestamp ? (
                            <time className={styles.timelineTimestamp}>{entry.timestamp}</time>
                          ) : null}
                        </div>
                        <div className={styles.timelineText}>
                          <ReactMarkdown components={markdownComponents}>{body}</ReactMarkdown>
                        </div>
                        {showStepIO && (entry.input || entry.output) ? (
                          <details className={styles.ioDetails}>
                            <summary>Input / output</summary>
                            {entry.input ? (
                              <div>
                                <span className={styles.ioLabel}>Input</span>
                                <pre className={styles.ioBlock}>{entry.input}</pre>
                              </div>
                            ) : null}
                            {entry.output ? (
                              <div>
                                <span className={styles.ioLabel}>Output</span>
                                <pre className={styles.ioBlock}>{entry.output}</pre>
                              </div>
                            ) : null}
                          </details>
                        ) : null}
                        {entryIndex < group.entries.length - 1 ? (
                          <span className={styles.timelineEntryDivider} aria-hidden="true" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function VisualReasoning({
  activeSession,
  reasoningGroups,
  runUsageSummary,
  latestError,
  fallbackContent,
  showStepIO,
}: {
  activeSession: AgentSession | null;
  reasoningGroups: ReasoningGroup[];
  runUsageSummary: string;
  latestError: string;
  fallbackContent: string;
  showStepIO: boolean;
}) {
  const transcriptMessages = withoutManagerErrorMessages(activeSession?.messages || []);
  const hasTranscript = transcriptMessages.length > 0;
  const hasContent = reasoningGroups.length > 0 || hasTranscript || Boolean(runUsageSummary);

  return (
    <>
      <RunOverview
        activeSession={activeSession}
        latestError={latestError}
        hasContent={hasContent}
      />
      {hasTranscript ? <Transcript messages={transcriptMessages} visual /> : null}
      <ReasoningTimeline
        groups={reasoningGroups}
        showStepIO={showStepIO}
        isRunning={activeSession?.status === 'running'}
      />
      {runUsageSummary ? (
        <details className={styles.visualRunDetails}>
          <summary>Run details</summary>
          <ReactMarkdown components={summaryMarkdownComponents}>{runUsageSummary}</ReactMarkdown>
        </details>
      ) : null}
      {latestError ? (
        <aside className={styles.reasoningError} role="alert">
          <strong className={styles.reasoningErrorLabel}>Latest error</strong>
          <span>{latestError}</span>
        </aside>
      ) : null}
      {!reasoningGroups.length && !runUsageSummary && !hasTranscript ? (
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
  viewType = 'text',
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
          reasoningGroups={visualReasoningGroups}
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
