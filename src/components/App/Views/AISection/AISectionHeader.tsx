import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import styles from './AISectionHeader.module.css';

type AISectionHeaderProps = {
  title: string;
  showStepIOToggle: boolean;
  showStepIO: boolean;
  showAutoScrollToggle?: boolean;
  autoScroll?: boolean;
  copied: boolean;
  onToggleStepIO: () => void;
  onToggleAutoScroll?: () => void;
  onCopy: () => void;
};

export default function AISectionHeader({
  title,
  showStepIOToggle,
  showStepIO,
  showAutoScrollToggle = false,
  autoScroll = true,
  copied,
  onToggleStepIO,
  onToggleAutoScroll,
  onCopy,
}: AISectionHeaderProps) {
  return (
    <header className={styles.header}>
      <div>
        <span className={styles.eyebrow}>AI pane</span>
        <h1>{title}</h1>
      </div>
      <div className={styles.actions}>
        {showAutoScrollToggle ? (
          <Tooltip content={autoScroll ? 'Turn auto-scroll off' : 'Turn auto-scroll on'}>
            <button
              type="button"
              className={`${styles.stepIOToggle} ${autoScroll ? styles.stepIOToggleActive : ''}`}
              onClick={onToggleAutoScroll}
              aria-label={autoScroll ? 'Turn auto-scroll off' : 'Turn auto-scroll on'}
              aria-pressed={autoScroll}
            >
              <Icons.ArrowDownToLine size={16} />
            </button>
          </Tooltip>
        ) : null}
        {showStepIOToggle ? (
          <Tooltip content={`${showStepIO ? 'Hide' : 'Show'} input/output for each agent step`}>
            <button
              type="button"
              className={`${styles.stepIOToggle} ${showStepIO ? styles.stepIOToggleActive : ''}`}
              onClick={onToggleStepIO}
              aria-label={`${showStepIO ? 'Hide' : 'Show'} input/output for each agent step`}
              aria-pressed={showStepIO}
            >
              <Icons.Terminal size={16} />
            </button>
          </Tooltip>
        ) : null}
        <Tooltip content={copied ? 'Copied!' : 'Copy to clipboard'}>
          <button
            type="button"
            className={styles.copyButton}
            onClick={onCopy}
            aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
          >
            {copied ? <Icons.Check size={16} /> : <Icons.Copy size={16} />}
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
