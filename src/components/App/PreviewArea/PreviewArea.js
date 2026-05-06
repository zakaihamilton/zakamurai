'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icons } from '../Icons';
import Tooltip from '../../Widgets/Tooltip/Tooltip';
import styles from './PreviewArea.module.css';

export default function PreviewArea({ htmlContent }) {
  const iframeRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [scale, setScale] = useState(1);
  const [, setError] = useState(null);

  // We use a timestamp to force the iframe to reload when the build completes
  const [refreshKey, setRefreshKey] = useState(Date.now());
  const [isSwReady, setIsSwReady] = useState(
    !!(typeof navigator !== 'undefined' && navigator.serviceWorker?.controller),
  );

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleControllerChange = () => {
      setIsSwReady(!!navigator.serviceWorker.controller);
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () =>
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
  }, []);

  useEffect(() => {
    if (!htmlContent) return;
    setIsLoading(true);
    setError(null);
    // When htmlContent changes, we simply increment the key to reload the virtual path
    setRefreshKey(Date.now());
  }, [htmlContent]);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setRefreshKey(Date.now());
  }, []);

  const handleOpenExternal = useCallback(() => {
    window.open('/__virtual__/3000/index.html', '_blank');
  }, []);

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
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.trafficLights}>
          <span className={`${styles.dot} ${styles.dotRed}`} />
          <span className={`${styles.dot} ${styles.dotYellow}`} />
          <span className={`${styles.dot} ${styles.dotGreen}`} />
        </div>

        <div className={styles.addressBar}>
          <Icons.Globe />
          <span className={styles.addressText}>
            localhost:3000/__virtual__/3000/index.html
          </span>
          {isLoading && <span className={styles.loadingDot} />}
        </div>

        <div className={styles.toolbarActions}>
          <Tooltip content="Zoom out">
            <button type="button" className={styles.toolBtn} onClick={handleZoomOut}>
              −
            </button>
          </Tooltip>
          <button type="button" className={styles.zoomLevel} onClick={handleZoomReset}>
            {Math.round(scale * 100)}%
          </button>
          <Tooltip content="Zoom in">
            <button type="button" className={styles.toolBtn} onClick={handleZoomIn}>
              +
            </button>
          </Tooltip>
          <div className={styles.separator} />
          <Tooltip content="Refresh preview">
            <button type="button" className={styles.toolBtn} onClick={handleRefresh}>
              <Icons.Refresh />
            </button>
          </Tooltip>
          <Tooltip content="Open in new tab">
            <button type="button" className={styles.toolBtn} onClick={handleOpenExternal}>
              <Icons.ExternalLink />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className={styles.viewport}>
        {isLoading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner} />
          </div>
        )}
        {!isSwReady && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner} />
            <p className={styles.loadingText}>Initializing Service Worker...</p>
          </div>
        )}
        <div
          className={styles.scaleWrapper}
          style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          {/* 
              CRITICAL: We point src to /index.html. 
              The almostnode Service Worker MUST be active to intercept this. 
          */}
          <iframe
            key={refreshKey}
            ref={iframeRef}
            src="/__virtual__/3000/index.html"
            title="Preview"
            className={styles.iframe}
            onLoad={handleLoad}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            style={{
              width: scale !== 1 ? `${100 / scale}%` : '100%',
              height: scale !== 1 ? `${100 / scale}%` : '100%',
            }}
          />
        </div>
      </div>
    </div>
  );
}
