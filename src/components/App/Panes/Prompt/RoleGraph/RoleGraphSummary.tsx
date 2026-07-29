import { describeRoleGraph } from '@/components/AI/Agent/Roles';
import type { RoleGraphSummaryProps } from '@/components/App/Panes/Prompt/prompt-types';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import styles from './RoleGraphSummary.module.css';

export default function RoleGraphSummary({
  roleGraph,
  disabled = false,
  onEdit,
}: RoleGraphSummaryProps) {
  const summary = roleGraph ? describeRoleGraph(roleGraph) : 'No roles configured';

  return (
    <div className={styles.summary} aria-label="Team role graph summary">
      <button
        type="button"
        className={styles.summaryBody}
        disabled={disabled}
        onClick={onEdit}
        aria-label="Edit role graph"
      >
        <span className={styles.summaryLabel}>Role graph</span>
        <span className={styles.summaryText}>{summary}</span>
      </button>
      <Tooltip content="Edit role graph">
        <button
          type="button"
          className={`${styles.iconBtn} ${styles.summaryEdit}`}
          disabled={disabled}
          onClick={onEdit}
          aria-label="Open role graph editor"
        >
          <Icons.Edit />
        </button>
      </Tooltip>
    </div>
  );
}
