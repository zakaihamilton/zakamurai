import { WorkspaceHealthState } from '@/components/Workspace';
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
  return (
    <output className={styles.health}>
      <span className={styles.dot} data-status={health.status} />
      <span>
        {health.status === 'indexing'
          ? 'Indexing workspace…'
          : `${health.indexedFiles}/${health.totalFiles} files indexed`}
      </span>
      {skipped > 0 && (
        <span title="Some files were excluded or too large"> · {skipped} skipped</span>
      )}
    </output>
  );
}
