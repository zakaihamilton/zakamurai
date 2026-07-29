import React from 'react';
import LogItem, { ProcessingLogItem } from '../Item';
import type { LogListProps } from '../log-area-types';
import styles from './List.module.css';

export default function LogList({
  visibleLogs,
  totalLogsCount,
  filterText,
  isProcessing,
  isAIProcessing,
  isSystemProcessing,
}: LogListProps) {
  return (
    <div className={styles.logContainer}>
      {visibleLogs.map(({ log, displayIndex }) => (
        <LogItem key={log.id} log={log} displayIndex={displayIndex} />
      ))}
      {totalLogsCount > 0 && visibleLogs.length === 0 && (
        <div className={styles.emptyState}>No logs match "{filterText}"</div>
      )}
      {isProcessing && (
        <ProcessingLogItem
          lineNumber={totalLogsCount + 1}
          processingClassName={styles.processing}
          message={
            isAIProcessing && isSystemProcessing
              ? 'AI & System working...'
              : isAIProcessing
                ? 'AI is working...'
                : 'System is working...'
          }
        />
      )}
    </div>
  );
}
