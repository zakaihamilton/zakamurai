import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import React from 'react';
import styles from './SessionManager.module.css';

export default function SessionManager({
  sessions = [],
  activeSessionId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  isOpen = true,
}) {
  return (
    <div className={styles.manager}>
      <div className={styles.list} role="tablist" aria-label="Agent sessions">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          return (
            <button
              key={session.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
              onClick={() => onSelect(session.id)}
              disabled={!isOpen}
              title={session.name}
            >
              <span className={styles.tabName}>{session.name}</span>
              {session.status === 'running' && (
                <span className={styles.runningDot} aria-label="Running" />
              )}
            </button>
          );
        })}
      </div>
      <div className={styles.actions}>
        <Tooltip content="New session">
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onCreate}
            disabled={!isOpen}
            aria-label="New session"
          >
            <Icons.Plus />
          </button>
        </Tooltip>
        <Tooltip content="Rename session">
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onRename}
            disabled={!isOpen || !activeSessionId}
            aria-label="Rename session"
          >
            <Icons.Edit />
          </button>
        </Tooltip>
        <Tooltip content="Delete session">
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onDelete}
            disabled={!isOpen || !activeSessionId}
            aria-label="Delete session"
          >
            <Icons.Trash />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
