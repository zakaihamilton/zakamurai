import type { LogItemProps, ProcessingLogItemProps } from '../log-area-types';
import styles from './Item.module.css';

function isErrorLog(text: string): boolean {
  return /^(?:ERR:|Stack:|Compilation error:|Unexpected error:|Error\s*:|Failed to |Command .+ failed\b|npm ERR!|\[ERROR\])/i.test(
    text,
  );
}

export function ProcessingLogItem({
  lineNumber,
  message,
  processingClassName,
}: ProcessingLogItemProps) {
  return (
    <div className={styles.logItem}>
      <span className={styles.lineNumber}>{lineNumber}</span>
      <span className={styles.timestamp}>--:--:--</span>
      <span className={styles.prompt}>&gt;</span>
      <div className={`${styles.logContent} ${processingClassName}`}>{message}</div>
    </div>
  );
}

export default function LogItem({ log, displayIndex }: LogItemProps) {
  const isError = isErrorLog(log.text || '');

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
