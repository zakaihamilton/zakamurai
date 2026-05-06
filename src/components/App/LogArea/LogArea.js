import React, { useEffect, useRef } from 'react';
import { createState } from '../../Core/Base/State';
import { Icons } from '../Icons';
import Tooltip from '../../Widgets/Tooltip/Tooltip';
import Settings from '../../Storage/Settings';
import styles from './LogArea.module.css';

export const LogState = createState('LogState');
LogState.useState.initial = {
  logs: Settings.getAILogs(),
  isProcessing: false,
};

export default function LogArea() {
  const logState = LogState.useState();
  const { logs = [], isProcessing } = logState;
  const bottomRef = useRef();

  useEffect(() => {
    Settings.setAILogs(logs);
  }, [logs]);

  useEffect(() => {
    if (logs.length || isProcessing) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isProcessing]);

  return (
    <div className={`${styles.logArea} scroll-hide`}>
      <div className={styles.logContainer}>
        {logs.map((log) => (
          <div
            key={log.id}
            className={`${styles.logItem} ${log.role === 'ai' ? styles.aiRow : styles.userRow}`}
          >
            <div
              className={`${styles.avatar} ${log.role === 'ai' ? styles.aiAvatar : styles.userAvatar}`}
            >
              {log.role === 'ai' ? <Icons.Bot /> : <Icons.User />}
            </div>
            <div
              className={`${styles.bubble} ${log.role === 'ai' ? styles.aiBubble : styles.userBubble}`}
            >
              {log.text}
              <Tooltip content="Copy to clipboard" className={styles.copyBtnWrapper}>
                <button
                  type="button"
                  className={styles.copyBtn}
                  onClick={() => navigator.clipboard.writeText(log.text)}
                >
                  <Icons.Copy />
                </button>
              </Tooltip>
            </div>
          </div>
        ))}
        {isProcessing && (
          <div className={styles.logItem}>
            <div className={`${styles.avatar} ${styles.aiAvatar}`}>
              <Icons.Bot />
            </div>
            <div className={styles.processingBubble}>Generating architecture scaffolding...</div>
          </div>
        )}
        <div ref={bottomRef} style={{ height: '10px' }} />
      </div>
    </div>
  );
}
