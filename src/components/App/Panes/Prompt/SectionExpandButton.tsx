import Tooltip from '@/components/ui/Tooltip';
import { useState } from 'react';
import styles from './SectionExpandButton.module.css';

export default function SectionActions({
  content,
  onOpenInTab,
}: {
  content: string;
  onOpenInTab?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.actions}>
      <Tooltip content={copied ? 'Copied!' : 'Copy to clipboard'}>
        <button
          type="button"
          className={styles.button}
          onClick={copy}
          aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
        >
          <span aria-hidden="true">{copied ? '✓' : '⧉'}</span>
        </button>
      </Tooltip>
      <Tooltip content="Open as tab">
        <button
          type="button"
          className={styles.button}
          onClick={onOpenInTab}
          aria-label="Open section as tab"
        >
          <span aria-hidden="true">↗</span>
        </button>
      </Tooltip>
    </div>
  );
}
