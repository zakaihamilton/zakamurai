import { Icons } from '@/components/Core/Base/Icons';
import React from 'react';
import styles from '../TopBar.module.css';

export default function WorkingIndicator({ isProcessing, processingType }) {
  if (!isProcessing) return null;

  return (
    <div className={styles.workingIndicator}>
      {processingType === 'ai' ? <Icons.BotSmall /> : <Icons.RefreshSmall />}
      <span>{processingType === 'ai' ? 'AI is working...' : 'System is working...'}</span>
    </div>
  );
}
