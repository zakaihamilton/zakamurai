import { Icons } from '@/components/ui/Icons';
import ToolbarButton from '@/components/ui/ToolbarButton';
import Tooltip from '@/components/ui/Tooltip';
import type { ReasoningViewType } from './AISectionReasoning';
import styles from './AISectionHeader.module.css';

const reasoningViewOptions: Array<{
  type: ReasoningViewType;
  label: string;
  icon: typeof Icons.Brain;
}> = [
  { type: 'visual', label: 'Visual timeline', icon: Icons.Brain },
  { type: 'text', label: 'Text log', icon: Icons.Terminal },
];

type AISectionHeaderProps = {
  title: string;
  showStepIOToggle: boolean;
  showStepIO: boolean;
  showViewToggle?: boolean;
  viewType?: ReasoningViewType;
  showAutoScrollToggle?: boolean;
  autoScroll?: boolean;
  copied: boolean;
  onToggleStepIO: () => void;
  onSelectView?: (viewType: ReasoningViewType) => void;
  onToggleAutoScroll?: () => void;
  onCopy: () => void;
};

export default function AISectionHeader({
  title,
  showStepIOToggle,
  showStepIO,
  showViewToggle = false,
  viewType = 'visual',
  showAutoScrollToggle = false,
  autoScroll = true,
  copied,
  onToggleStepIO,
  onSelectView,
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
        {showViewToggle && onSelectView ? (
          <div className={styles.viewSwitch} aria-label="Reasoning view">
            {reasoningViewOptions.map(({ type, label, icon: Icon }) => (
              <ToolbarButton
                key={type}
                className={`${styles.viewButton} ${viewType === type ? styles.viewButtonActive : ''}`}
                onClick={() => onSelectView(type)}
                tooltip={label}
                aria-label={`Show ${label.toLowerCase()}`}
                aria-pressed={viewType === type}
              >
                <Icon size={16} />
              </ToolbarButton>
            ))}
          </div>
        ) : null}
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
