import type { AgentSessionMessage } from '@/types/domain-types';
import ReactMarkdown from 'react-markdown';
import { keyReasoningEntries, type ReasoningGroup } from './AISectionReasoningUtils';
import { markdownComponents, summaryMarkdownComponents } from './ReasoningMarkdown';
import styles from './ReasoningText.module.css';

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

export default function TextReasoning({
  messages,
  groups,
  runUsageSummary,
  latestError,
  fallbackContent,
}: {
  messages: AgentSessionMessage[];
  groups: ReasoningGroup[];
  runUsageSummary: string;
  latestError: string;
  fallbackContent: string;
}) {
  const hasTranscript = messages.length > 0;

  return (
    <>
      {hasTranscript ? <Transcript messages={messages} /> : null}
      <ReasoningGroups groups={groups} />
      {runUsageSummary ? (
        <section className={styles.runSummary}>
          <ReactMarkdown components={summaryMarkdownComponents}>{runUsageSummary}</ReactMarkdown>
        </section>
      ) : null}
      {latestError ? (
        <aside className={styles.reasoningError} role="alert">
          <strong className={styles.reasoningErrorLabel}>Latest error</strong>
          <span>{latestError}</span>
        </aside>
      ) : null}
      {!groups.length && !runUsageSummary && !hasTranscript && !latestError ? (
        <section className={styles.reasoningGroup}>
          <article className={styles.reasoningEntry}>
            <div className={styles.reasoningText}>{fallbackContent}</div>
          </article>
        </section>
      ) : null}
    </>
  );
}
