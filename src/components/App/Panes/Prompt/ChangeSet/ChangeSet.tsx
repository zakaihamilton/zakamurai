import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { useFileSystem } from '@/components/Storage';
import { ChangeSetState } from '@/components/Workspace';
import Tooltip from '@/components/ui/Tooltip';
import { useCallback, useState } from 'react';
import { requireStore } from '../../../types';
import SectionActions from '../SectionExpandButton';
import styles from './ChangeSet.module.css';
import { approveAllChangeSetChanges, undoAllChangeSetChanges } from './bulkActions';

export default function ChangeSetPanel({ onOpenInTab = () => {} }: { onOpenInTab?: () => void }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const state = requireStore(ChangeSetState.useState(['activeId', 'items']));
  const editorState = requireStore(
    EditorState.useState(['fileContents', 'pendingDiffs', 'pendingDeletions']),
  );
  const sidebarState = SidebarState.usePassiveState();
  const tabState = TabState.usePassiveState();
  const fs = useFileSystem();
  const changeSet = (state.items || []).find((item) => item.id === state.activeId);
  if (!changeSet) return null;
  const reviewed = changeSet.files.filter(
    (file) => file.status && file.status !== 'pending-review',
  ).length;
  const changeSetText = [
    `Status: ${changeSet.status}`,
    `Request: ${changeSet.request}`,
    `${reviewed}/${changeSet.files.length} files reviewed`,
    '',
    'Files:',
    ...changeSet.files.map((file) => `- ${file.path} (${file.status || 'pending review'})`),
  ].join('\n');
  const pendingCount = changeSet.files.filter(
    (file) => !file.status || file.status === 'pending-review',
  ).length;
  const runBulkAction = useCallback(
    async (action: 'approve' | 'undo') => {
      const params = {
        changeSetId: changeSet.id,
        editorState: editorState as never,
        changeSetState: state as never,
        fs,
        sidebarState: sidebarState as never,
        tabState: tabState as never,
      };
      if (action === 'approve') await approveAllChangeSetChanges(params);
      else await undoAllChangeSetChanges(params);
    },
    [changeSet.id, editorState, fs, sidebarState, state, tabState],
  );
  return (
    <section className={styles.panel} aria-label="AI change set review">
      <div className={styles.header}>
        <Tooltip
          content={
            'Change Set\nFiles the AI wants to modify and their review status.\nIncludes the original request.'
          }
        >
          <button
            type="button"
            className={styles.titleButton}
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((expanded) => !expanded)}
          >
            Change set
          </button>
        </Tooltip>
        <div className={styles.actions}>
          <span className={styles.status}>{changeSet.status}</span>
          <SectionActions content={changeSetText} onOpenInTab={onOpenInTab} />
        </div>
      </div>
      {isExpanded && (
        <>
          <p className={styles.request}>{changeSet.request}</p>
          <p className={styles.summary}>
            {reviewed}/{changeSet.files.length} files reviewed · Open each file to accept or reject
            its diff.
          </p>
          <div className={styles.bulkActions}>
            <button
              type="button"
              className={styles.approveAll}
              disabled={pendingCount === 0}
              onClick={() => void runBulkAction('approve')}
            >
              Approve all ({pendingCount})
            </button>
            <button
              type="button"
              className={styles.undoAll}
              disabled={pendingCount === 0}
              onClick={() => void runBulkAction('undo')}
            >
              Undo all ({pendingCount})
            </button>
          </div>
          <div className={styles.files}>
            {changeSet.files.slice(0, 6).map((file) => (
              <span key={file.path} className={styles.file}>
                {file.status === 'conflicted' ? '⚠ ' : ''}
                {file.path}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
