import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import type { WelcomeActionsProps } from '../welcome-types';
import styles from './Actions.module.css';

export default function WelcomeActions({
  onShowInfo,
  onShowInstructions,
  onShowReadiness,
}: WelcomeActionsProps) {
  return (
    <div className={styles.supportingActions}>
      <Tooltip content="Project Information">
        <button
          type="button"
          className={styles.textAction}
          onClick={onShowInfo}
          aria-label="Show project information"
        >
          <Icons.Info size={18} />
          <span>Project info</span>
        </button>
      </Tooltip>
      <Tooltip content="Instructions">
        <button
          type="button"
          className={styles.textAction}
          onClick={onShowInstructions}
          aria-label="Show instructions"
        >
          <Icons.Code size={18} />
          <span>Instructions</span>
        </button>
      </Tooltip>
      <Tooltip content="Runtime and device readiness">
        <button
          type="button"
          className={styles.textAction}
          onClick={onShowReadiness}
          aria-label="Show runtime and device readiness"
        >
          <Icons.AlertCircle size={18} />
          <span>Readiness</span>
        </button>
      </Tooltip>
    </div>
  );
}
