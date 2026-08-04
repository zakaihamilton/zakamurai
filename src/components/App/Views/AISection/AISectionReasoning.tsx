import type {
  AgentReasoningEntry,
  AgentSession,
  AgentSessionMessage,
} from '@/components/state/domain-types';
import { withoutManagerErrorMessages } from '@/components/App/Panes/Prompt/AgentSessions';
import { useEffect } from 'react';
import type { RefObject } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import styles from './AISectionReasoning.module.css';

export type ReasoningGroup = { step: number | null; entries: AgentReasoningEntry[] };

type AISectionReasoningProps = {
  activeSession: AgentSession | null;
  reasoningGroups: ReasoningGroup[];
  runUsageSummary: string;
  latestError?: string;
  fallbackContent: string;
  content: string;
  contentRef: RefObject<HTMLDivElement | null>;
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
  runUsageSummary,
  latestError = '',
  fallbackContent,
  content,
  contentRef,
}: AISectionReasoningProps) {
  const transcriptMessages = withoutManagerErrorMessages(activeSession?.messages || []);
  const hasTranscript = transcriptMessages.length > 0;

  useEffect(() => {
    if (!content || !contentRef.current) return;
    contentRef.current.scrollTo({
      top: contentRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [content, contentRef]);

  return (
    <div ref={contentRef} className={`${styles.content} ${styles.markdownContent}`}>
      {hasTranscript ? <Transcript messages={transcriptMessages} /> : null}
      <ReasoningGroups groups={reasoningGroups} />
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
      {!reasoningGroups.length && !runUsageSummary && !hasTranscript && !latestError ? (
        <section className={styles.reasoningGroup}>
          <article className={styles.reasoningEntry}>
            <div className={styles.reasoningText}>{fallbackContent}</div>
          </article>
        </section>
      ) : null}
    </div>
  );
}
