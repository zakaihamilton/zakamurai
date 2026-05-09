import { Icons } from '@/components/Core/Base/Icons';
import { createState } from '@/components/Core/Base/State';
import React, { useCallback } from 'react';
import { createPortal } from 'react-dom';
import styles from './Notification.module.css';

export const NotificationState = createState('NotificationState');

export function Notification() {
  const notificationState = NotificationState.useState();
  const { notifications = [] } = notificationState;

  const removeNotification = useCallback(
    (id) => {
      notificationState((draft) => {
        draft.notifications = draft.notifications.filter((n) => n.id !== id);
      });
    },
    [notificationState],
  );

  const content = (
    <div className={styles.container}>
      {notifications.map((n) => (
        <button
          type="button"
          key={n.id}
          className={`${styles.toast} ${styles[n.type]}`}
          onClick={() => removeNotification(n.id)}
        >
          <div className={styles.icon}>
            {n.type === 'success' && <Icons.Code size={16} />}
            {n.type === 'error' && <Icons.Trash size={16} />}
            {n.type === 'info' && <Icons.Bot size={16} />}
          </div>
          <div className={styles.message}>{n.message}</div>
        </button>
      ))}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

export function useNotification() {
  const notificationState = NotificationState.useState();

  const addNotification = useCallback(
    (message, type = 'info', duration = 3000) => {
      const id = Date.now();
      notificationState((draft) => {
        const notifications = draft.notifications || [];
        draft.notifications = [...notifications, { id, message, type }];
      });

      setTimeout(() => {
        notificationState((draft) => {
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
