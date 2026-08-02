import type { AgentSession } from '@/components/state/domain-types';
import Dialog from '@/components/ui/Dialog';
import { Icons } from '@/components/ui/Icons';
import { useEffect, useMemo, useState } from 'react';
import { getAgentSessionChildren } from '../AgentSessions';
import type { SessionTreeDialogProps } from '../prompt-types';
import styles from './SessionTreeDialog.module.css';

function hasRunningDescendant(sessions: Record<string, AgentSession>, sessionId: string): boolean {
  const children = getAgentSessionChildren(sessions, sessionId);
  return children.some(
    (child) => child.status === 'running' || hasRunningDescendant(sessions, child.id),
  );
}

export default function SessionTreeDialog({
  isOpen,
  sessions = {},
  activeSessionId,
  onCancel,
  onSelect,
  onCreate,
  onBranch,
  onRename,
  onDelete,
}: SessionTreeDialogProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const roots = useMemo(() => getAgentSessionChildren(sessions, null), [sessions]);

  useEffect(() => {
    if (!isOpen) return;
    setExpandedIds(
      new Set(
        Object.values(sessions)
          .filter((session) => getAgentSessionChildren(sessions, session.id).length > 0)
          .map((session) => session.id),
      ),
    );
  }, [isOpen, sessions]);

  const toggleExpanded = (sessionId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const renderNode = (session: AgentSession) => {
    const children = getAgentSessionChildren(sessions, session.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(session.id);
    const isActive = session.id === activeSessionId;
    const isDeleteBlocked =
      session.status === 'running' || hasRunningDescendant(sessions, session.id);

    return (
      <li key={session.id}>
        <div className={`${styles.row} ${isActive ? styles.active : ''}`}>
          {hasChildren ? (
            <button
              type="button"
              className={styles.expandButton}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${session.name}`}
              onClick={() => toggleExpanded(session.id)}
            >
              {isExpanded ? <Icons.ChevronDown size={14} /> : <Icons.ChevronRight size={14} />}
            </button>
          ) : (
            <span className={styles.expandSpacer} />
          )}
          <button
            type="button"
            className={styles.selectButton}
            onClick={() => onSelect(session.id)}
          >
            <span className={styles.name}>{session.name}</span>
            <span className={styles.mode}>Conversation</span>
            {session.status === 'running' && (
              <span className={styles.running} aria-label="Running" />
            )}
          </button>
          <div className={styles.nodeActions}>
            <button
              type="button"
              aria-label={`Branch ${session.name}`}
              onClick={() => onBranch(session.id)}
              disabled={session.status === 'running'}
            >
              <Icons.Copy size={14} />
            </button>
            <button
              type="button"
              aria-label={`Rename ${session.name}`}
              onClick={() => onRename(session.id)}
            >
              <Icons.Edit size={14} />
            </button>
            <button
              type="button"
              aria-label={`Delete ${session.name} and branches`}
              onClick={() => onDelete(session.id)}
              disabled={isDeleteBlocked}
            >
              <Icons.Trash size={14} />
            </button>
          </div>
        </div>
        {hasChildren && isExpanded ? <ul>{children.map((child) => renderNode(child))}</ul> : null}
      </li>
    );
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="Conversation history"
      onCancel={onCancel}
      onConfirm={onCancel}
      footer={null}
      className={styles.dialog}
    >
      <div className={styles.toolbar}>
        <p>Branch a conversation to continue it independently.</p>
        <button
          type="button"
          className={styles.newRootButton}
          onClick={() => onCreate()}
          aria-label="New conversation"
        >
          <Icons.Plus size={15} /> New conversation
        </button>
      </div>
      <nav className={styles.treeRegion} aria-label="Conversation history">
        <ul className={styles.tree}>{roots.map((root) => renderNode(root))}</ul>
      </nav>
    </Dialog>
  );
}
