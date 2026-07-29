import type { ModelCacheToggleProps } from '../prompt-types';
import styles from './ModelCacheToggle.module.css';

export default function ModelCacheToggle({
  isCached,
  isBusy,
  disabled,
  onToggle,
}: ModelCacheToggleProps) {
  return (
    <button
      type="button"
      className={`${styles.toggle} ${isCached ? styles.cached : ''} ${isBusy ? styles.busy : ''}`}
      disabled={disabled || isBusy}
      onClick={onToggle}
      aria-label={isCached ? 'Remove from cache' : 'Cache model'}
    >
      {isBusy ? '…' : isCached ? 'Cached' : 'Cache'}
    </button>
  );
}
