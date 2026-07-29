import Node from '@/components/state/Node';
import type { ReasoningPanelStateShape } from '@/components/state/domain-types';
import { createState } from '@/components/state/State';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { AgentSessionState, getActiveAgentSession } from '../AgentSessions';
import { PromptUiState } from '../Prompt';
import styles from './Reasoning.module.css';
import { requireStore } from '../../../types';

const ReasoningPanelState = createState<ReasoningPanelStateShape>('ReasoningPanelState');

export default function ReasoningPanel() {
  return (
    <Node id="ReasoningPanel">
      <ReasoningPanelInner />
    </Node>
  );
}

function ReasoningPanelInner() {
  const agentSessionState = requireStore(AgentSessionState.useState(['sessions', 'activeSessionId']));
  const activeSession = getActiveAgentSession(agentSessionState);
  const reasoning = activeSession?.reasoning || '';
  const { isReasoningVisible = true } = requireStore(PromptUiState.useState('isReasoningVisible')) || {};
  const reasoningPanelState = requireStore(ReasoningPanelState.useState(null, { isCopied: false }));
  const { isCopied = false } = reasoningPanelState || {};
  const reasoningRef = useRef(null);

  useEffect(() => {
    if (reasoning && reasoningRef.current) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight;
    }
  }, [reasoning]);

  const handleCopy = () => {
    navigator.clipboard.writeText(reasoning);
    reasoningPanelState((draft) => {
      draft.isCopied = true;
    });
    setTimeout(() => {
      reasoningPanelState((draft) => {
        draft.isCopied = false;
      });
    }, 2000);
  };

  return (
    <div
      className={`${styles.reasoningWrapper} ${
        reasoning && isReasoningVisible ? styles.reasoningVisible : ''
      }`}
    >
      <div className={styles.reasoningContainer}>
        <div className={styles.reasoningHeader}>
          <div className={styles.reasoningTitle}>
            <Icons.Brain size={14} />
            <span>Progress & Reasoning</span>
          </div>
          <div className={styles.reasoningActions}>
            <Tooltip content={isCopied ? 'Copied!' : 'Copy Reasoning'}>
              <button
                type="button"
                aria-label={isCopied ? 'Reasoning copied' : 'Copy reasoning'}
                className={`${styles.iconButton} ${isCopied ? styles.copySuccess : ''}`}
                onClick={handleCopy}
              >
                {isCopied ? <Icons.Check size={14} /> : <Icons.Copy size={14} />}
              </button>
            </Tooltip>
          </div>
        </div>
        <div ref={reasoningRef} className={styles.reasoningContent}>
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
      </div>
    </div>
  );
}
