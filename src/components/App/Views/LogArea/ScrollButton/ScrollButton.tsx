import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import type { LogScrollButtonProps } from '../log-area-types';
import styles from './ScrollButton.module.css';

export default function LogScrollButton({ onScrollToBottom }: LogScrollButtonProps) {
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
