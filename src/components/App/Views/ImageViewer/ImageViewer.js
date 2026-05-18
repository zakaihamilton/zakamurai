import React, { useEffect, useState } from 'react';
import styles from './ImageViewer.module.css';

export default function ImageViewer({ tab }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [showLoading, setShowLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const loadingTimeout = setTimeout(() => setShowLoading(true), 500);

    return () => clearTimeout(loadingTimeout);
  }, []);

  useEffect(() => {
    let isActive = true;
    let urlToRevoke = null;

    if (tab?.fsHandle) {
      tab.fsHandle
        .getFile()
        .then((f) => {
          if (!isActive) return;
          const url = URL.createObjectURL(f);
          urlToRevoke = url;
          setImageUrl(url);
          setHasError(false);
        })
        .catch((err) => {
          console.error('Failed to get file from handle:', err);
          setHasError(true);
        });
    } else if (tab?.file?.content) {
      // For when file content is loaded differently
    }

    return () => {
      isActive = false;
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
      }
      setImageUrl(null);
    };
  }, [tab?.fsHandle, tab?.file?.content]);

  if (hasError) {
    return (
      <div className={styles.container}>
        <div style={{ color: 'var(--text-error, red)', textAlign: 'center' }}>
          Failed to load media. The file might be corrupted or unsupported.
        </div>
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className={styles.container}>
        {showLoading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner} />
            <div style={{ marginLeft: '10px' }}>Loading image...</div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {tab?.file?.name?.match(/\.(webm|mp4|ogg)$/i) ? (
        // biome-ignore lint/a11y/useMediaCaption: we don't have captions for these raw files
        <video src={imageUrl} controls className={styles.image} onError={() => setHasError(true)} />
      ) : (
        <img
          src={imageUrl}
          alt={tab?.file?.name || 'Image'}
          className={styles.image}
          onError={() => setHasError(true)}
        />
      )}
    </div>
  );
}
