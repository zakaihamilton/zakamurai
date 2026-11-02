import { LogState } from '@/components/App/Views/LogArea';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { requireStore } from '../../../types';
import styles from './WorkingIndicator.module.css';

export default function WorkingIndicator({
  onOpenProgress,
}: {
  onOpenProgress?: () => void;
}) {
  const { isAIProcessing } = requireStore(LogState.useState(['isAIProcessing']));

  if (!isAIProcessing) return null;

  return (
    <Tooltip content="AI working...">
      <button
        type="button"
        className={styles.workingIndicator}
        onClick={onOpenProgress}
        aria-label="AI working..."
      >
        <Icons.BotSmall />
        <span className={styles.activityDots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
    </Tooltip>
  );
}
