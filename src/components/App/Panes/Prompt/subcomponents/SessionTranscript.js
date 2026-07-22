import React, { useEffect, useRef } from 'react';
import styles from './SessionTranscript.module.css';

export default function SessionTranscript({ messages = [] }) {
  const endRef = useRef(null);
  const lastMessageId = messages.at(-1)?.id;

  useEffect(() => {
    if (lastMessageId == null) return;
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [lastMessageId]);

  if (!messages.length) {
    return (
      <div className={styles.empty} aria-label="Session transcript">
        Start a conversation with this agent session.
      </div>
    );
  }

  return (
    <div className={`${styles.transcript} scrollHide`} aria-label="Session transcript">
      {messages.map((message) => {
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
}
