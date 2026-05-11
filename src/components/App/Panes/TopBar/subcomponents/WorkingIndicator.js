import { Icons } from '@/components/Core/Base/Icons';
import React from 'react';
import styles from '../TopBar.module.css';

export default function WorkingIndicator({ isSystemProcessing, isAIProcessing }) {
  if (!isSystemProcessing && !isAIProcessing) return null;

  return (
    <div className={styles.workingIndicator}>
      {isAIProcessing && (
        <div className={styles.indicatorGroup}>
          <Icons.BotSmall />
          <span>AI working...</span>
        </div>
      )}
      {isSystemProcessing && (
        <div className={styles.indicatorGroup}>
          <Icons.RefreshSmall />
          <span>System working...</span>
        </div>
      )}
    </div>
  );
}
