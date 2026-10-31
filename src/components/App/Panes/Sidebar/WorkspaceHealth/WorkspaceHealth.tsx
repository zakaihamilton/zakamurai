import { WorkspaceHealthState } from '@/components/Workspace';
import Tooltip from '@/components/ui/Tooltip';
import styles from './WorkspaceHealth.module.css';

export default function WorkspaceHealth() {
  const health = WorkspaceHealthState.useState([
    'status',
    'indexedFiles',
    'totalFiles',
    'skippedFiles',
  ]);
  if (!health || health.status === 'idle') return null;
  const skipped = health.skippedFiles?.length || 0;
  const content = (
    <output className={styles.health}>
      <span className={styles.dot} data-status={health.status} />
      <span>
        {health.status === 'indexing'
          ? 'Indexing workspace…'
          : `${health.indexedFiles}/${health.totalFiles} files indexed`}
      </span>
      {skipped > 0 ? <span> · {skipped} skipped</span> : null}
    </output>
  );

  return skipped > 0 ? (
    <Tooltip content="Some files were excluded or too large" className={styles.tooltipWrapper}>
      {content}
    </Tooltip>
  ) : (
    content
  );
}
