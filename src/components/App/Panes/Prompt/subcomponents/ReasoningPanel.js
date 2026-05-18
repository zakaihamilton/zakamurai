import { Icons } from '@/components/Core/Base/Icons';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

export default function ReasoningPanel({ reasoning, isReasoningVisible, styles = {} }) {
  const [isCopied, setIsCopied] = useState(false);
  const reasoningRef = useRef(null);

  useEffect(() => {
    if (reasoning && reasoningRef.current) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight;
    }
  }, [reasoning]);

  const handleCopy = () => {
    navigator.clipboard.writeText(reasoning);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
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
                className={`${styles.iconButton} ${isCopied ? styles.copySuccess : ''}`}
                onClick={handleCopy}
              >
                {isCopied ? <Icons.Check size={14} /> : <Icons.Copy size={14} />}
              </button>
            </Tooltip>
          </div>
        </div>
        <div ref={reasoningRef} className={`${styles.reasoningContent} scrollHide`}>
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
