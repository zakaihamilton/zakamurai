import { Icons } from '@/components/Core/Base/Icons';
import { createState } from '@/components/Core/Base/State';
import Settings from '@/components/Storage/Settings';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { formatShortcut } from '@/utils/os';
import React, { useEffect, useRef } from 'react';
import styles from './LogArea.module.css';

export const LogState = createState('LogState');
const LogAreaUiState = createState('LogAreaUiState');
LogState.useState.initial = {
  logs: Settings.getAILogs(),
  isProcessing: false,
  processingType: null, // 'ai' or 'system'
  reasoning: '',
};

export default function LogArea() {
  const logState = LogState.useState();
  const { logs = [], isProcessing } = logState;
  const logAreaUiState = LogAreaUiState.useState(null, { copied: false, autoScroll: true });
  const { copied = false, autoScroll = true } = logAreaUiState || {};
  const bottomRef = useRef();
  const containerRef = useRef();

  useEffect(() => {
    const timer = setTimeout(() => {
      Settings.setAILogs(logs);
    }, 1000);
    return () => clearTimeout(timer);
  }, [logs]);

  useEffect(() => {
    if (autoScroll && (logs.length || isProcessing)) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
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
      // If we are scrolling UP, disable auto-scroll
      // This prevents the smooth scroll to bottom from disabling auto-scroll
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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      <div ref={containerRef} className={`${styles.logArea} scroll-hide`} onScroll={handleScroll}>
        {logs.length > 0 && (
          <div className={styles.header}>
            <div className={styles.headerActions}>
              <Tooltip content={copied ? 'Copied!' : 'Copy all logs'}>
                <button
                  type="button"
                  className={`${styles.headerBtn} ${copied ? styles.copied : ''}`}
                  onClick={handleCopyAll}
                  aria-label="Copy all logs"
                >
                  {copied ? <Icons.Check /> : <Icons.Copy />}
                </button>
              </Tooltip>
              <Tooltip content="Clear logs" shortcut={formatShortcut('⌘K')}>
                <button
                  type="button"
                  onClick={handleClear}
                  className={styles.headerBtn}
                  aria-label="Clear logs"
                >
                  <Icons.Trash />
                </button>
              </Tooltip>
            </div>
          </div>
        )}
        <div className={styles.logContainer}>
          {logs.slice(-200).map((log, index) => {
            const displayIndex = logs.length > 200 ? logs.length - 200 + index : index;
            return (
              <div
                key={log.id}
                className={`${styles.logItem} ${
                  log.role === 'ai'
                    ? styles.aiRow
                    : log.role === 'system'
                      ? styles.systemRow
                      : styles.userRow
                } ${
                  log.text?.startsWith('ERR:') ||
                  log.text?.startsWith('Stack:') ||
                  /\berror\b/i.test(log.text)
                    ? styles.errorRow
                    : ''
                }`}
              >
                <span className={styles.lineNumber}>{displayIndex + 1}</span>
                <span className={styles.timestamp}>{log.timestamp || '--:--:--'}</span>
                <span className={styles.prompt}>{log.role === 'user' ? '$' : '>'}</span>
                <div className={styles.logContent}>{log.text}</div>
              </div>
            );
          })}
          {isProcessing && (
            <div className={styles.logItem}>
              <span className={styles.lineNumber}>{logs.length + 1}</span>
              <span className={styles.prompt}>&gt;</span>
              <div className={`${styles.logContent} ${styles.processing}`}>Processing...</div>
            </div>
          )}
          <div ref={bottomRef} style={{ height: '10px' }} />
        </div>
      </div>

      {!autoScroll && (
        <div className={styles.scrollButtonContainer}>
          <Tooltip content="Goto the current line">
            <button
              type="button"
              className={styles.jumpBtn}
              onClick={scrollToBottom}
              aria-label="Jump to bottom"
            >
              <Icons.ChevronDown />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
