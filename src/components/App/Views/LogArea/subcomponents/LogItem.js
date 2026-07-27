import React from 'react';
import styles from '../LogArea.module.css';

export default function LogItem({ log, displayIndex }) {
  const isError =
    log.text?.startsWith('ERR:') || log.text?.startsWith('Stack:') || /\berror\b/i.test(log.text);

  const roleClass =
    log.role === 'ai' ? styles.aiRow : log.role === 'system' ? styles.systemRow : styles.userRow;

  return (
    <div className={`${styles.logItem} ${roleClass} ${isError ? styles.errorRow : ''}`}>
      <span className={styles.lineNumber}>{displayIndex + 1}</span>
      <span className={styles.timestamp}>{log.timestamp || '--:--:--'}</span>
      <span className={styles.prompt}>{log.role === 'user' ? '$' : '>'}</span>
      <div className={styles.logContent}>{log.text}</div>
    </div>
  );
}
