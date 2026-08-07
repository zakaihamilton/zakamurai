import type { ModelCacheToggleProps } from '../model-types';
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
      className={`${styles.modelCacheToggle} ${isCached ? styles.modelCacheToggleOn : ''}`}
      disabled={disabled || isBusy}
      onClick={onToggle}
      aria-label={isCached ? 'Remove from cache' : 'Cache model'}
      aria-pressed={isCached}
    >
      <span className={styles.modelCacheToggleTrack} aria-hidden="true">
        <span className={styles.modelCacheToggleThumb} />
      </span>
      <span>{isBusy ? '…' : isCached ? 'Cached' : 'Cache'}</span>
    </button>
  );
}
