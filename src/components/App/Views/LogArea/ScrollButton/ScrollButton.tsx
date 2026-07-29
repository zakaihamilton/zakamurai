import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import React from 'react';
import styles from './ScrollButton.module.css';

export default function LogScrollButton({ onScrollToBottom }) {
  return (
    <div className={styles.scrollButtonContainer}>
      <Tooltip content="Goto the current line">
        <button
          type="button"
          className={styles.jumpBtn}
          onClick={onScrollToBottom}
          aria-label="Jump to bottom"
        >
          <Icons.ChevronDown />
        </button>
      </Tooltip>
    </div>
  );
}
