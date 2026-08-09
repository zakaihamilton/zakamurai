import ToolbarButton from '@/components/ui/ToolbarButton';
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
      <ToolbarButton
        className={styles.button}
        onClick={copy}
        tooltip={copied ? 'Copied!' : 'Copy to clipboard'}
        aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
      >
        <span aria-hidden="true">{copied ? '✓' : '⧉'}</span>
      </ToolbarButton>
      <ToolbarButton
        className={styles.button}
        onClick={onOpenInTab}
        tooltip="Open as tab"
        aria-label="Open section as tab"
      >
        <span aria-hidden="true">↗</span>
      </ToolbarButton>
    </div>
  );
}
