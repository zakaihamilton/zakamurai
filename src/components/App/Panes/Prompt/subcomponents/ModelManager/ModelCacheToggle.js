import React from 'react';
import styles from './ModelCacheToggle.module.css';

export default function ModelCacheToggle({ isCached, isBusy, disabled, onToggle }) {
  return (
    <button
      type="button"
      className={`${styles.modelCacheToggle} ${isCached ? styles.modelCacheToggleOn : ''}`}
      aria-pressed={isCached}
      onClick={onToggle}
      disabled={disabled}
    >
      <span className={styles.modelCacheToggleTrack}>
        <span className={styles.modelCacheToggleThumb} />
      </span>
      <span>{isBusy ? 'Working...' : isCached ? 'Cached' : 'Cache'}</span>
    </button>
  );
}
