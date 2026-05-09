import React, { createContext, useContext, useState, useCallback } from 'react';
import { Icons } from '../../App/Icons';
import styles from './Notification.module.css';

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now();
    setNotifications((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, duration);
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ addNotification }}>
      {children}
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
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
