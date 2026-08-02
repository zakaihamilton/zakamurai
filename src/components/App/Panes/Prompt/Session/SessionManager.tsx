import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import type { SessionManagerProps } from '../prompt-types';
import styles from './SessionManager.module.css';

export default function SessionManager({
  activeSession,
  onOpenTree,
  isOpen = true,
}: SessionManagerProps) {
  return (
    <div className={styles.manager}>
      <div className={styles.activeAgent} aria-label="Active conversation">
        <span className={styles.activeLabel}>Conversation</span>
        <span className={styles.activeName} title={activeSession?.name}>
          {activeSession?.name || 'No conversation selected'}
        </span>
        {activeSession?.status === 'running' && (
          <span className={styles.runningDot} aria-label="Running" />
        )}
      </div>
      <div className={styles.actions}>
        <Tooltip content="Open conversation history">
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onOpenTree}
            disabled={!isOpen}
            aria-label="Open conversation history"
          >
            <Icons.History />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
