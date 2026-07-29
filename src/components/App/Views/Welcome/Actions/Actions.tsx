import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import React from 'react';
import type { WelcomeActionsProps } from '../welcome-types';
import styles from './Actions.module.css';

export default function WelcomeActions({ onShowInfo, onShowInstructions }: WelcomeActionsProps) {
  return (
    <div className={styles.supportingActions}>
      <Tooltip content="Project Information">
        <button
          type="button"
          className={styles.textAction}
          onClick={onShowInfo}
          aria-label="Show project information"
        >
          <Icons.Info size={18} />
          <span>Project info</span>
        </button>
      </Tooltip>
      <Tooltip content="Instructions">
        <button
          type="button"
          className={styles.textAction}
          onClick={onShowInstructions}
          aria-label="Show instructions"
        >
          <Icons.Code size={18} />
          <span>Instructions</span>
        </button>
      </Tooltip>
    </div>
  );
}
