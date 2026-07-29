import { LogState } from '@/components/App/Views/LogArea';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { requireStore } from '../../../types';
import styles from './WorkingIndicator.module.css';

export default function WorkingIndicator() {
  const { isAIProcessing } = requireStore(LogState.useState(['isAIProcessing']));

  if (!isAIProcessing) return null;

  return (
    <Tooltip content="AI working...">
      <div className={styles.workingIndicator} aria-label="AI working...">
        <Icons.BotSmall />
        <span className={styles.activityDots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    </Tooltip>
  );
}
