import { LogState } from '@/components/App/Views/LogArea';
import { Icons } from '@/components/ui/Icons';
import React from 'react';
import styles from './WorkingIndicator.module.css';

export default function WorkingIndicator() {
  const { isAIProcessing } = LogState.useState(['isAIProcessing']);

  if (!isAIProcessing) return null;

  return (
    <div className={styles.workingIndicator}>
      <div className={styles.indicatorGroup}>
        <Icons.BotSmall />
        <span>AI working...</span>
      </div>
    </div>
  );
}
