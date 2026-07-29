import type { RoleGraphHeaderProps } from '@/components/App/Panes/Prompt/prompt-types';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import styles from './RoleGraphHeader.module.css';

export default function RoleGraphHeader({
  showTitle = true,
  disabled = false,
  onReset,
  onAddCustom,
}: RoleGraphHeaderProps) {
  return (
    <div className={styles.header}>
      {showTitle ? (
        <div>
          <div className={styles.title}>Role graph</div>
          <div className={styles.subtitle}>Order, kinds, and per-role models for Team mode</div>
        </div>
      ) : (
        <div className={styles.subtitle}>Order, kinds, and per-role models for Team mode</div>
      )}
      <div className={styles.headerActions}>
        <Tooltip content="Reset to Planner → Coder → Reviewer">
          <button
            type="button"
            className={styles.iconBtn}
            disabled={disabled}
            onClick={onReset}
            aria-label="Reset role graph"
          >
            <Icons.Refresh />
          </button>
        </Tooltip>
        <Tooltip content="Add custom role">
          <button
            type="button"
            className={styles.iconBtn}
            disabled={disabled}
            onClick={onAddCustom}
            aria-label="Add role"
          >
            <Icons.Plus />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
