import { Icons } from '@/components/ui/Icons';
import ToolbarButton from '@/components/ui/ToolbarButton';
import { useState } from 'react';
import ManagerTraceInspector from '../ManagerTraceInspector';
import type { PromptHeaderProps } from '../prompt-types';
import styles from './Header.module.css';
import SupportedToolsDialog from './SupportedToolsDialog';

export default function PromptHeader({
  isAIProcessing: _isAIProcessing,
  isSystemProcessing,
  copyContent = '',
  latestManagerTrace,
  traceFiles,
  onReplayRequest,
}: PromptHeaderProps) {
  const [copied, setCopied] = useState(false);
  const [isToolsDialogOpen, setIsToolsDialogOpen] = useState(false);

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
        <ToolbarButton
          className={styles.headerActionBtn}
          onClick={() => setIsToolsDialogOpen(true)}
          tooltip="View supported AI tools"
          aria-haspopup="dialog"
          aria-label="View supported AI tools"
        >
          <Icons.Grid size={15} />
        </ToolbarButton>
        <ManagerTraceInspector
          trace={latestManagerTrace || null}
          files={traceFiles}
          onReplayRequest={onReplayRequest}
        />
        <ToolbarButton
          className={`${styles.headerActionBtn} ${copied ? styles.headerActionBtnActive : ''}`}
          onClick={handleCopy}
          tooltip={copied ? 'Copied!' : 'Copy full session (transcript & reasoning)'}
          aria-label={
            copied
              ? 'Copied full session to clipboard'
              : 'Copy full session transcript and reasoning to clipboard'
          }
        >
          {copied ? <Icons.Check /> : <Icons.Copy />}
        </ToolbarButton>
      </div>
      <SupportedToolsDialog
        isOpen={isToolsDialogOpen}
        onCancel={() => setIsToolsDialogOpen(false)}
      />
    </div>
  );
}
