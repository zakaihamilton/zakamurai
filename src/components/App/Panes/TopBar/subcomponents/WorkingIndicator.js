import { PreviewState } from '@/components/App/PreviewState';
import { LogState } from '@/components/App/Views/LogArea';
import { Icons } from '@/components/ui/Icons';
import React from 'react';
import styles from './WorkingIndicator.module.css';

export default function WorkingIndicator() {
  const { isSystemProcessing, isAIProcessing } = LogState.useState([
    'isSystemProcessing',
    'isAIProcessing',
  ]);
  const { compileStatus, compilePhase } = PreviewState.useState(['compileStatus', 'compilePhase']);

  if (!isSystemProcessing && !isAIProcessing) return null;

  const systemLabel =
    compileStatus && compileStatus !== 'idle' && compileStatus !== 'success'
      ? compilePhase || `Compile ${compileStatus}…`
      : 'System working...';

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
          <span>{systemLabel}</span>
        </div>
      )}
    </div>
  );
}
