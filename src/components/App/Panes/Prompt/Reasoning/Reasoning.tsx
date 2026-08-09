import Node from '@/components/state/Node';
import type { AgentSessionMessage } from '@/components/state/domain-types';
import { Icons } from '@/components/ui/Icons';
import ToolbarButton from '@/components/ui/ToolbarButton';
import Tooltip from '@/components/ui/Tooltip';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { requireStore } from '../../../types';
import {
  AgentSessionState,
  formatReasoningEvents,
  getActiveAgentSession,
  getLatestManagerError,
  withoutManagerErrorMessages,
} from '../AgentSessions';
import SectionActions from '../SectionExpandButton';
import styles from './Reasoning.module.css';

const formatDuration = (milliseconds: number): string => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '—';
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
};

type ReasoningPanelProps = {
  modelDownloadStatus?: string;
  onOpenInTab?: () => void;
  onClearLog?: () => void;
  showStepIO?: boolean;
  onToggleStepIO?: (show: boolean) => void;
};

export default function ReasoningPanel({
  modelDownloadStatus = '',
  onOpenInTab,
  onClearLog,
  showStepIO: showStepIOProp = false,
  onToggleStepIO,
}: ReasoningPanelProps) {
  return (
    <Node id="ReasoningPanel">
      <ReasoningPanelInner
        modelDownloadStatus={modelDownloadStatus}
        onOpenInTab={onOpenInTab}
        onClearLog={onClearLog}
        showStepIO={showStepIOProp}
        onToggleStepIO={onToggleStepIO}
      />
    </Node>
  );
}

function ReasoningPanelInner({
  modelDownloadStatus,
  onOpenInTab = () => {},
  onClearLog = () => {},
  showStepIO: showStepIOProp = false,
  onToggleStepIO,
}: ReasoningPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showStepIO, setShowStepIO] = useState(showStepIOProp);
  const agentSessionState = requireStore(
    AgentSessionState.useState(['sessions', 'activeSessionId']),
  );
  const activeSession = getActiveAgentSession(agentSessionState);
  const reasoning = activeSession?.reasoning || '';
  const reasoningEvents = activeSession?.reasoningEvents || [];
  const messages = activeSession?.messages || [];
  const transcriptMessages = withoutManagerErrorMessages(messages);
  const displayedReasoning = formatReasoningEvents(reasoningEvents, showStepIO) || reasoning;
  const latestError = getLatestManagerError(activeSession);
  const runUsage = activeSession?.runUsage;
  const toolEntries = Object.entries(runUsage?.toolCalls || {}).filter(([, count]) => count > 0);
  const hasDiagnostics = Boolean(
    runUsage && (runUsage.modelCalls > 0 || toolEntries.length > 0 || runUsage.totalMs > 0),
  );
  const diagnosticsText = hasDiagnostics
    ? [
        '--- Run diagnostics ---',
        `Model: ${(runUsage?.modelIds || []).join(', ') || 'unknown'}`,
        `Model calls: ${runUsage?.modelCalls || 0}`,
        `Outcomes: success ${runUsage?.outcomes.success || 0}, errors ${runUsage?.outcomes.error || 0}, aborted ${runUsage?.outcomes.aborted || 0}`,
        `Duration: ${formatDuration(runUsage?.totalMs || 0)}`,
        `Tools: ${toolEntries.map(([name, count]) => `${name} ×${count}`).join(', ') || 'none'}`,
      ].join('\n')
    : '';
  const transcriptText = transcriptMessages.length
    ? transcriptMessages
        .map((message) => `[${message.timestamp || 'now'}] ${message.role}: ${message.text}`)
        .join('\n\n')
    : '';
  const reasoningRef = useRef<HTMLDivElement | null>(null);

  const lastScrollTop = useRef(0);

  const handleScroll = useCallback(() => {
    const contentElement = reasoningRef.current;
    if (!contentElement) return;

    const { scrollTop, scrollHeight, clientHeight } = contentElement;
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10;

    if (isAtBottom) {
      setAutoScroll(true);
    } else if (scrollTop < lastScrollTop.current && autoScroll) {
      setAutoScroll(false);
    }
    lastScrollTop.current = scrollTop;
  }, [autoScroll]);

  useEffect(() => {
    setShowStepIO(showStepIOProp);
  }, [showStepIOProp]);

  useEffect(() => {
    if (latestError) setIsExpanded(true);
  }, [latestError]);

  useEffect(() => {
    if (
      autoScroll &&
      (displayedReasoning || latestError || modelDownloadStatus || messages.length) &&
      reasoningRef.current
    ) {
      reasoningRef.current.scrollTo?.({
        top: reasoningRef.current.scrollHeight,
        // Repeated smooth-scroll animations compete with local model inference.
        behavior: 'auto',
      });
    }
  }, [autoScroll, displayedReasoning, latestError, messages.length, modelDownloadStatus]);

  const reasoningText = [
    transcriptText ? `--- Transcript ---\n${transcriptText}` : '',
    modelDownloadStatus,
    displayedReasoning,
    diagnosticsText,
    latestError ? `--- Latest error ---\n${latestError}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const hasLog = Boolean(displayedReasoning || messages.length || hasDiagnostics || latestError);
  const isLogClearDisabled = !hasLog || activeSession?.status === 'running';
  const isPanelVisible = Boolean(
    displayedReasoning || modelDownloadStatus || messages.length || latestError,
  );

  return (
    <div
      className={`${styles.reasoningWrapper} ${
        isPanelVisible ? styles.reasoningVisible : ''
      } ${!isExpanded ? styles.reasoningCollapsed : ''}`}
    >
      <div className={styles.reasoningContainer}>
        <div className={styles.reasoningHeader}>
          <div className={styles.reasoningTitle}>
            <Icons.Brain size={14} />
            <Tooltip
              content={
                'Progress & Reasoning\nLive updates while the agent works.\nIncludes planning, tool activity, downloads, completion status, and the session transcript.'
              }
            >
              <button
                type="button"
                className={styles.titleButton}
                aria-expanded={isExpanded}
                onClick={() => setIsExpanded((expanded) => !expanded)}
              >
                Progress & Reasoning
              </button>
            </Tooltip>
          </div>
          <div className={styles.reasoningActions}>
            <ToolbarButton
              className={styles.clearLogButton}
              onClick={onClearLog}
              disabled={isLogClearDisabled}
              tooltip={
                activeSession?.status === 'running'
                  ? 'Clear AI Model log after the current run'
                  : 'Clear AI Model log'
              }
              aria-label="Clear AI Model log"
            >
              <Icons.Trash size={14} />
            </ToolbarButton>
            <ToolbarButton
              className={`${styles.stepIOToggle} ${autoScroll ? styles.stepIOToggleActive : ''}`}
              onClick={() => setAutoScroll((enabled) => !enabled)}
              tooltip={autoScroll ? 'Turn auto-scroll off' : 'Turn auto-scroll on'}
              aria-label={autoScroll ? 'Turn auto-scroll off' : 'Turn auto-scroll on'}
              aria-pressed={autoScroll}
              showCompletedIcon={false}
            >
              <Icons.ArrowDownToLine size={14} />
            </ToolbarButton>
            <ToolbarButton
              className={`${styles.stepIOToggle} ${showStepIO ? styles.stepIOToggleActive : ''}`}
              onClick={() => {
                const next = !showStepIO;
                setShowStepIO(next);
                onToggleStepIO?.(next);
              }}
              tooltip={`${showStepIO ? 'Hide' : 'Show'} input/output for each agent step`}
              aria-label={`${showStepIO ? 'Hide' : 'Show'} input/output for each agent step`}
              aria-pressed={showStepIO}
              showCompletedIcon={false}
            >
              <Icons.Terminal size={14} />
            </ToolbarButton>
            <SectionActions content={reasoningText} onOpenInTab={onOpenInTab} />
          </div>
        </div>
        {isExpanded && (
          <div ref={reasoningRef} className={styles.reasoningContent} onScroll={handleScroll}>
            {transcriptMessages.length ? (
              <section className={styles.transcriptSection} aria-label="Session transcript">
                {transcriptMessages.map((message: AgentSessionMessage) => {
                  const label =
                    message.role === 'user'
                      ? 'You'
                      : message.role === 'ai'
                        ? message.agentRole
                          ? `AI · ${message.agentRole}`
                          : 'AI'
                        : 'System';
                  return (
                    <article className={styles.reasoningEntry} key={message.id}>
                      <div className={styles.timestamp}>
                        {message.timestamp ? <time>{message.timestamp}</time> : null}
                        {message.timestamp ? ' · ' : ''}
                        <span className={styles.transcriptType}>{label}</span>
                      </div>
                      <div className={`${styles.reasoningText} ${styles.transcriptText}`}>
                        {message.text}
                      </div>
                    </article>
                  );
                })}
              </section>
            ) : null}
            {modelDownloadStatus && (
              <output className={styles.downloadStatus} aria-live="polite">
                <span className={styles.downloadSpinner} aria-hidden="true" />
                <span>{modelDownloadStatus}</span>
              </output>
            )}
            {hasDiagnostics && runUsage && (
              <details className={styles.diagnostics} open>
                <summary>Run diagnostics</summary>
                <dl className={styles.diagnosticsGrid}>
                  <dt>Model</dt>
                  <dd>{runUsage.modelIds.join(', ') || 'unknown'}</dd>
                  <dt>Calls</dt>
                  <dd>{runUsage.modelCalls}</dd>
                  <dt>Outcome</dt>
                  <dd>
                    {runUsage.outcomes.success} passed · {runUsage.outcomes.error} errors ·{' '}
                    {runUsage.outcomes.aborted} aborted
                  </dd>
                  <dt>Duration</dt>
                  <dd>{formatDuration(runUsage.totalMs)}</dd>
                  <dt>Tools</dt>
                  <dd>
                    {toolEntries.map(([name, count]) => `${name} ×${count}`).join(' · ') || 'none'}
                  </dd>
                </dl>
              </details>
            )}
            <ReactMarkdown
              components={{
                a: ({ node, ...props }) => <a className={styles.reasoningLink} {...props} />,
                blockquote: ({ node, ...props }) => (
                  <blockquote className={styles.reasoningBlockquote} {...props} />
                ),
                code: ({ node, ...props }) => <code className={styles.reasoningCode} {...props} />,
                h1: ({ node, ...props }) => <h1 className={styles.reasoningHeading} {...props} />,
                h2: ({ node, ...props }) => <h2 className={styles.reasoningHeading} {...props} />,
                h3: ({ node, ...props }) => <h3 className={styles.reasoningHeading} {...props} />,
                h4: ({ node, ...props }) => <h4 className={styles.reasoningHeading} {...props} />,
                h5: ({ node, ...props }) => <h5 className={styles.reasoningHeading} {...props} />,
                h6: ({ node, ...props }) => <h6 className={styles.reasoningHeading} {...props} />,
                li: ({ node, ...props }) => <li className={styles.reasoningListItem} {...props} />,
                ol: ({ node, ...props }) => <ol className={styles.reasoningList} {...props} />,
                p: ({ node, ...props }) => <p className={styles.reasoningParagraph} {...props} />,
                pre: ({ node, ...props }) => <pre className={styles.reasoningPre} {...props} />,
                ul: ({ node, ...props }) => <ul className={styles.reasoningList} {...props} />,
              }}
            >
              {displayedReasoning}
            </ReactMarkdown>
            {latestError ? (
              <aside className={styles.reasoningError} role="alert">
                <strong className={styles.reasoningErrorLabel}>Latest error</strong>
                <span>{latestError}</span>
              </aside>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
