import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { useState } from 'react';
import ManagerTraceInspector from '../ManagerTraceInspector';
import type { PromptHeaderProps } from '../prompt-types';
import styles from './Header.module.css';

export default function PromptHeader({
  isAIProcessing: _isAIProcessing,
  isSystemProcessing,
  copyContent = '',
  latestManagerTrace,
  latestAIIncident,
  onExportAIIncident,
  traceFiles,
  onReplayRequest,
}: PromptHeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!copyContent) return;
    try {
      await navigator.clipboard.writeText(copyContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failures in unsupported environments
    }
  };

  return (
    <div className={styles.header}>
      <h2 className={styles.title}>AI Manager</h2>
      <div className={styles.headerActions}>
        {isSystemProcessing && <span className={styles.status}>Compiling</span>}
        <ManagerTraceInspector
          trace={latestManagerTrace || null}
          files={traceFiles}
          onReplayRequest={onReplayRequest}
        />
        {latestAIIncident && (
          <Tooltip content="Export AI incident">
            <button
              type="button"
              className={styles.headerActionBtn}
              onClick={onExportAIIncident}
              aria-label="Export AI incident"
            >
              <Icons.Download />
            </button>
          </Tooltip>
        )}
        <Tooltip content={copied ? 'Copied!' : 'Copy full session (transcript & reasoning)'}>
          <button
            type="button"
            className={`${styles.headerActionBtn} ${copied ? styles.headerActionBtnActive : ''}`}
            onClick={handleCopy}
            aria-label={
              copied
                ? 'Copied full session to clipboard'
                : 'Copy full session transcript and reasoning to clipboard'
            }
          >
            {copied ? <Icons.Check /> : <Icons.Copy />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
