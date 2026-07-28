import { createState } from '@/components/state/State';
import React, { useEffect, useRef } from 'react';
import LogList from './List';
import styles from './LogArea.module.css';
import LogScrollButton from './ScrollButton';
import LogToolbar from './Toolbar';

export const LogState = createState('LogState');
export const LogAreaUiState = createState('LogAreaUiState');

export default function LogArea() {
  const logState = LogState.useState(['logs', 'isSystemProcessing', 'isAIProcessing']);
  const { logs = [], isSystemProcessing, isAIProcessing } = logState;
  const isProcessing = isSystemProcessing || isAIProcessing;
  const logAreaUiState = LogAreaUiState.useState(null, {
    copied: false,
    autoScroll: true,
    filterText: '',
  });
  const { copied = false, autoScroll = true, filterText = '' } = logAreaUiState || {};
  const containerRef = useRef();
  const normalizedFilter = filterText.trim().toLowerCase();
  const visibleLogs = logs
    .map((log, index) => ({ log, displayIndex: index }))
    .filter(({ log }) => {
      if (!normalizedFilter) return true;
      return [log.role, log.timestamp, log.text]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedFilter));
    })
    .slice(-200);

  useEffect(() => {
    if (autoScroll && containerRef.current && (logs.length || isProcessing)) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, isProcessing, autoScroll]);

  const lastScrollTop = useRef(0);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10;

    if (isAtBottom) {
      logAreaUiState((draft) => {
        draft.autoScroll = true;
      });
    } else {
      if (scrollTop < lastScrollTop.current && autoScroll) {
        logAreaUiState((draft) => {
          draft.autoScroll = false;
        });
      }
    }
    lastScrollTop.current = scrollTop;
  };

  const scrollToBottom = () => {
    logAreaUiState((draft) => {
      draft.autoScroll = true;
    });
    containerRef.current?.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: 'smooth',
    });
  };

  const handleClear = () => {
    logState.logs = [];
  };

  const handleCopyAll = () => {
    const allLogs = logs.map((log) => `[${log.role}] ${log.text}`).join('\n\n');
    navigator.clipboard.writeText(allLogs);
    logAreaUiState((draft) => {
      draft.copied = true;
    });
    setTimeout(
      () =>
        logAreaUiState((draft) => {
          draft.copied = false;
        }),
      2000,
    );
  };

  return (
    <div className={styles.logAreaWrapper}>
      <div ref={containerRef} className={styles.logArea} onScroll={handleScroll}>
        {logs.length > 0 && (
          <LogToolbar
            filterText={filterText}
            onFilterChange={(event) =>
              logAreaUiState((draft) => {
                draft.filterText = event.target.value;
              })
            }
            onClearFilter={() =>
              logAreaUiState((draft) => {
                draft.filterText = '';
              })
            }
            copied={copied}
            onCopyAll={handleCopyAll}
            onClearLogs={handleClear}
          />
        )}
        <LogList
          visibleLogs={visibleLogs}
          totalLogsCount={logs.length}
          filterText={filterText}
          isProcessing={isProcessing}
          isAIProcessing={isAIProcessing}
          isSystemProcessing={isSystemProcessing}
        />
      </div>

      {!autoScroll && <LogScrollButton onScrollToBottom={scrollToBottom} />}
    </div>
  );
}
