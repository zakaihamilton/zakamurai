import React from 'react';

export default function ModelCacheToggle({ isCached, isBusy, disabled, onToggle, styles = {} }) {
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
