import type { AgentSessionMessage } from '@/components/state/domain-types';
import Tooltip from '@/components/ui/Tooltip';
import { useEffect, useRef, useState } from 'react';
import SectionActions from '../SectionExpandButton';
import type { SessionTranscriptProps } from '../prompt-types';
import styles from './SessionTranscript.module.css';

export default function SessionTranscript({
  messages = [],
  onOpenInTab = () => {},
}: SessionTranscriptProps & { onOpenInTab?: () => void }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastMessageId = messages.at(-1)?.id;
  const transcriptText = messages.length
    ? messages
        .map((message) => `[${message.timestamp || 'now'}] ${message.role}: ${message.text}`)
        .join('\n\n')
    : 'Start a conversation with the AI Manager.';

  useEffect(() => {
    if (lastMessageId == null) return;
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [lastMessageId]);

  const content = !messages.length ? (
    <div className={styles.empty} aria-label="Session transcript">
      Start a conversation with the AI Manager.
    </div>
  ) : (
    <div className={styles.transcript} aria-label="Session transcript">
      {messages.map((message: AgentSessionMessage) => {
        const roleClass =
          message.role === 'user' ? styles.user : message.role === 'ai' ? styles.ai : styles.system;
        const label =
          message.role === 'user'
            ? 'You'
            : message.role === 'ai'
              ? message.agentRole
                ? `AI · ${message.agentRole}`
                : 'AI'
              : 'System';
        return (
          <div key={message.id} className={`${styles.item} ${roleClass}`}>
            <div className={styles.meta}>
              <span className={styles.role}>{label}</span>
              {message.timestamp ? <span className={styles.time}>{message.timestamp}</span> : null}
            </div>
            <div className={styles.text}>{message.text}</div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );

  return (
    <section className={`${styles.section} ${isExpanded ? '' : styles.collapsed}`}>
      <div className={styles.header}>
        <Tooltip
          content={
            'Transcript\nConversation history between you and the AI Manager.\nIncludes prompts, replies, and system messages.'
          }
        >
          <button
            type="button"
            className={styles.titleButton}
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((expanded) => !expanded)}
          >
            Transcript
          </button>
        </Tooltip>
        <SectionActions content={transcriptText} onOpenInTab={onOpenInTab} />
      </div>
      {isExpanded && content}
    </section>
  );
}
