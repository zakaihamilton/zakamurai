'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icons } from '../Icons';
import Tooltip from '../../Widgets/Tooltip/Tooltip';
import styles from './PreviewArea.module.css';

export default function PreviewArea({ htmlContent }) {
  const iframeRef = useRef(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState(null);

  // Build a blob URL from the HTML content whenever it changes
  useEffect(() => {
    if (!htmlContent) return;

    // Revoke previous blob URL to avoid memory leaks
    if (blobUrl) URL.revokeObjectURL(blobUrl);

    try {
      setIsLoading(true);
      setError(null);
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
    } catch (err) {
      setError(`Failed to create preview: ${err.message}`);
      setIsLoading(false);
    }

    return () => {
      // cleanup on unmount handled by explicit revoke above
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htmlContent]);

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleRefresh = useCallback(() => {
    if (!blobUrl) return;
    setIsLoading(true);
    // Force iframe reload by briefly clearing src then restoring
    if (iframeRef.current) {
      iframeRef.current.src = 'about:blank';
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = blobUrl;
        }
      }, 50);
    }
  }, [blobUrl]);

  const handleOpenExternal = useCallback(() => {
    if (blobUrl) window.open(blobUrl, '_blank');
  }, [blobUrl]);

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.1, 2));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.1, 0.3));
  const handleZoomReset = () => setScale(1);

  if (!htmlContent) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>
          <Icons.Globe />
        </div>
        <h2 className={styles.emptyTitle}>No Preview Available</h2>
        <p className={styles.emptyText}>
          Compile your project first. The preview will load{' '}
          <code className={styles.code}>dist/index.html</code> from the build output.
        </p>
        <div className={styles.emptyHint}>
          <Icons.Play />
          <span>Click <strong>Compile</strong> in the toolbar to build your project.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {/* Browser chrome toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.trafficLights}>
          <span className={`${styles.dot} ${styles.dotRed}`} />
          <span className={`${styles.dot} ${styles.dotYellow}`} />
          <span className={`${styles.dot} ${styles.dotGreen}`} />
        </div>

        <div className={styles.addressBar}>
          <Icons.Globe />
          <span className={styles.addressText}>dist/index.html</span>
          {isLoading && <span className={styles.loadingDot} />}
        </div>

        <div className={styles.toolbarActions}>
          <Tooltip content="Zoom out">
            <button type="button" className={styles.toolBtn} onClick={handleZoomOut} aria-label="Zoom out">
              <span className={styles.zoomIcon}>−</span>
            </button>
          </Tooltip>
          <button
            type="button"
            className={styles.zoomLevel}
            onClick={handleZoomReset}
            title="Reset zoom"
          >
            {Math.round(scale * 100)}%
          </button>
          <Tooltip content="Zoom in">
            <button type="button" className={styles.toolBtn} onClick={handleZoomIn} aria-label="Zoom in">
              <span className={styles.zoomIcon}>+</span>
            </button>
          </Tooltip>
          <div className={styles.separator} />
          <Tooltip content="Refresh preview">
            <button type="button" className={styles.toolBtn} onClick={handleRefresh} aria-label="Refresh preview">
              <Icons.Refresh />
            </button>
          </Tooltip>
          <Tooltip content="Open in new tab">
            <button type="button" className={styles.toolBtn} onClick={handleOpenExternal} aria-label="Open in new tab">
              <Icons.ExternalLink />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Preview viewport */}
      <div className={styles.viewport}>
        {error && (
          <div className={styles.errorBanner}>
            <Icons.Close />
            <span>{error}</span>
          </div>
        )}
        {isLoading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner} />
            <span>Loading preview...</span>
          </div>
        )}
        <div
          className={styles.scaleWrapper}
          style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          {blobUrl && (
            <iframe
              ref={iframeRef}
              src={blobUrl}
              title="Preview"
              className={styles.iframe}
              onLoad={handleLoad}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              style={{
                width: scale !== 1 ? `${100 / scale}%` : '100%',
                height: scale !== 1 ? `${100 / scale}%` : '100%',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
