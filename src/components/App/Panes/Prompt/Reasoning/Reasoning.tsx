import Node from '@/components/state/Node';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { requireStore } from '../../../types';
import { AgentSessionState, getActiveAgentSession } from '../AgentSessions';
import { PromptUiState } from '../Prompt';
import SectionActions from '../SectionExpandButton';
import styles from './Reasoning.module.css';

type ReasoningPanelProps = {
  modelDownloadStatus?: string;
  onOpenInTab?: () => void;
};

export default function ReasoningPanel({
  modelDownloadStatus = '',
  onOpenInTab,
}: ReasoningPanelProps) {
  return (
    <Node id="ReasoningPanel">
      <ReasoningPanelInner modelDownloadStatus={modelDownloadStatus} onOpenInTab={onOpenInTab} />
    </Node>
  );
}

function ReasoningPanelInner({ modelDownloadStatus, onOpenInTab = () => {} }: ReasoningPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const agentSessionState = requireStore(
    AgentSessionState.useState(['sessions', 'activeSessionId']),
  );
  const activeSession = getActiveAgentSession(agentSessionState);
  const reasoning = activeSession?.reasoning || '';
  const { isReasoningVisible = true } =
    requireStore(PromptUiState.useState('isReasoningVisible')) || {};
  const reasoningRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if ((reasoning || modelDownloadStatus) && reasoningRef.current) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight;
    }
  }, [modelDownloadStatus, reasoning]);

  const reasoningText = [modelDownloadStatus, reasoning].filter(Boolean).join('\n\n');

  return (
    <div
      className={`${styles.reasoningWrapper} ${
        (reasoning || modelDownloadStatus) && isReasoningVisible ? styles.reasoningVisible : ''
      } ${!isExpanded ? styles.reasoningCollapsed : ''}`}
    >
      <div className={styles.reasoningContainer}>
        <div className={styles.reasoningHeader}>
          <div className={styles.reasoningTitle}>
            <Icons.Brain size={14} />
            <Tooltip
              content={
                'Progress & Reasoning\nLive updates while the agent works.\nIncludes planning, tool activity, downloads, and completion status.'
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
            <SectionActions content={reasoningText} onOpenInTab={onOpenInTab} />
          </div>
        </div>
        {isExpanded && (
          <div ref={reasoningRef} className={styles.reasoningContent}>
            {modelDownloadStatus && (
              <output className={styles.downloadStatus} aria-live="polite">
                <span className={styles.downloadSpinner} aria-hidden="true" />
                <span>{modelDownloadStatus}</span>
              </output>
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
              {reasoning}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
