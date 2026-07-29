import { LogState } from '@/components/App/Views/LogArea';
import { Icons } from '@/components/ui/Icons';
import { requireStore } from '../../../types';
import styles from './WorkingIndicator.module.css';

export default function WorkingIndicator() {
  const { isAIProcessing } = requireStore(LogState.useState(['isAIProcessing']));

  if (!isAIProcessing) return null;

  return (
    <div className={styles.workingIndicator}>
      <div className={styles.indicatorGroup}>
        <Icons.BotSmall />
        <span>AI working...</span>
      </div>
    </div>
  );
}
