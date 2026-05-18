import { isVideoFile } from '@/utils/file';
import React, { useEffect, useState } from 'react';
import styles from './ImageViewer.module.css';

export default function ImageViewer({ file }) {
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    if (file?.fsHandle) {
      file.fsHandle.getFile().then((f) => {
        const url = URL.createObjectURL(f);
        setImageUrl(url);
      });
    } else if (file?.content) {
      // For when file content is loaded differently but it should be handled through fsHandle mostly
    }

    return () => {
      // Cleanup url later when unmounting, wait for a new effect
    };
  }, [file]);

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

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
      {file?.name?.match(/\.(webm|mp4|ogg)$/i) ? (
        // biome-ignore lint/a11y/useMediaCaption: we don't have captions for these raw files
        <video src={imageUrl} controls className={styles.image} />
      ) : (
        <img src={imageUrl} alt={file?.name || 'Image'} className={styles.image} />
      )}
    </div>
  );
}
