import React from 'react';
import LogItem from '../Item';
import styles from '../LogArea.module.css';

export default function LogList({
  visibleLogs,
  totalLogsCount,
  filterText,
  isProcessing,
  isAIProcessing,
  isSystemProcessing,
}) {
  return (
    <div className={styles.logContainer}>
      {visibleLogs.map(({ log, displayIndex }) => (
        <LogItem key={log.id} log={log} displayIndex={displayIndex} />
      ))}
      {totalLogsCount > 0 && visibleLogs.length === 0 && (
        <div className={styles.emptyState}>No logs match "{filterText}"</div>
      )}
      {isProcessing && (
        <div className={styles.logItem}>
          <span className={styles.lineNumber}>{totalLogsCount + 1}</span>
          <span className={styles.timestamp}>--:--:--</span>
          <span className={styles.prompt}>&gt;</span>
          <div className={`${styles.logContent} ${styles.processing}`}>
            {isAIProcessing && isSystemProcessing
              ? 'AI & System working...'
              : isAIProcessing
                ? 'AI is working...'
                : 'System is working...'}
          </div>
        </div>
      )}
    </div>
  );
}
