import React, { useEffect, useState } from 'react';
import styles from './ImageViewer.module.css';

export default function ImageViewer({ tab }) {
  const [imageUrl, setImageUrl] = useState(null);

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
        })
        .catch((err) => {
          console.error('Failed to get file from handle:', err);
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

  if (!imageUrl) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner} />
          <div style={{ marginLeft: '10px' }}>Loading image...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {tab?.file?.name?.match(/\.(webm|mp4|ogg)$/i) ? (
        // biome-ignore lint/a11y/useMediaCaption: we don't have captions for these raw files
        <video src={imageUrl} controls className={styles.image} />
      ) : (
        <img src={imageUrl} alt={tab?.file?.name || 'Image'} className={styles.image} />
      )}
    </div>
  );
}
