import type { NotificationItem, NotificationStateShape } from '@/components/state/domain-types';
import { createState } from '@/components/state/State';
import { Icons } from '@/components/ui/Icons';
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Notification.module.css';

export const NotificationState = createState<NotificationStateShape>('NotificationState');

export function Notification() {
  const [isMounted, setIsMounted] = useState(false);
  const notificationState = NotificationState.useState();
  const notifications = notificationState?.notifications ?? [];

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const removeNotification = useCallback(
    (id: number) => {
      notificationState?.((draft) => {
        draft.notifications = draft.notifications.filter((n) => n.id !== id);
      });
    },
    [notificationState],
  );

  const content = (
    <div className={styles.container}>
      {notifications.map((n: NotificationItem) => (
        <div key={n.id} className={`${styles.toast} ${styles[n.type]}`}>
          <div className={styles.icon}>
            {n.type === 'success' && <Icons.Check size={16} />}
            {n.type === 'error' && <Icons.AlertCircle size={16} />}
            {n.type === 'info' && <Icons.Info size={16} />}
          </div>
          <div className={styles.message}>{n.message}</div>
          {n.action && (
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                n.action?.onClick();
                removeNotification(n.id);
              }}
            >
              {n.action.label}
            </button>
          )}
          <button type="button" className={styles.dismiss} onClick={() => removeNotification(n.id)}>
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );

  if (!isMounted || typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

type NotificationAction = NotificationItem['action'];

export function useNotification() {
  const notificationState = NotificationState.useState();

  const addNotification = useCallback(
    (
      message: string,
      type: NotificationItem['type'] = 'info',
      duration = 3000,
      action: NotificationAction = null,
    ) => {
      const id = Date.now();
      notificationState?.((draft) => {
        const current = draft.notifications || [];
        draft.notifications = [...current, { id, message, type, action }];
      });

      setTimeout(() => {
        notificationState?.((draft) => {
          if (draft.notifications) {
            draft.notifications = draft.notifications.filter((n) => n.id !== id);
          }
        });
      }, duration);
    },
    [notificationState],
  );

  return { addNotification };
}
