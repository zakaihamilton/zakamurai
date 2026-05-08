'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Tooltip from '../../Widgets/Tooltip/Tooltip';
import { Icons } from '../Icons';
import styles from './PreviewArea.module.css';

export default function PreviewArea({ htmlContent, isCompilerReady }) {
  const iframeRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [scale, setScale] = useState(1);
  const [, setError] = useState(null);

  // We use a timestamp to force the iframe to reload when the build completes
  const [refreshKey, setRefreshKey] = useState(Date.now());
  const [isSwReady, setIsSwReady] = useState(
    !!(typeof navigator !== 'undefined' && navigator.serviceWorker?.controller),
  );
  const [isMaximized, setIsMaximized] = useState(false);
  const containerRef = useRef(null);

  const [address, setAddress] = useState('/preview/dist/index.html');
  const [host, setHost] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHost(window.location.host);
      // If we are on a subpath, we might need to prefix the address.
      // But we should only do this if we are sure it's necessary.
      // For now, let's assume root-relative paths are safer.
      const currentPath = window.location.pathname;
      if (currentPath.includes('/preview/')) {
        const baseBeforePreview = currentPath.split('/preview/')[0];
        if (
          baseBeforePreview &&
          baseBeforePreview !== '/' &&
          !address.startsWith(baseBeforePreview)
        ) {
          setAddress(`${baseBeforePreview}${address}`);
        }
      }
    }
  }, [address]);

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
    if (iframeRef.current) {
      try {
        const path = iframeRef.current.contentWindow.location.pathname;
        if (path && path !== 'blank') {
          setAddress(path);
        }
      } catch (_e) {
        // Ignore cross-origin errors
      }
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setRefreshKey(Date.now());
  }, []);

  const handleOpenExternal = useCallback(() => {
    window.open(address, '_blank');
  }, [address]);

  const toggleMaximize = useCallback(() => {
    setIsMaximized((v) => !v);
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
    <div ref={containerRef} className={`${styles.wrapper} ${isMaximized ? styles.maximized : ''}`}>
      <div className={styles.toolbar}>
        <div className={styles.addressBar}>
          <Icons.Globe />
          <span className={styles.addressText}>
            {host}
            {address}
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
          <Tooltip content={isMaximized ? 'Exit maximize' : 'Maximize preview'}>
            <button type="button" className={styles.toolBtn} onClick={toggleMaximize}>
              {isMaximized ? <Icons.Minimize /> : <Icons.Maximize />}
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
        {(!isSwReady || !isCompilerReady) && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner} />
            <p className={styles.loadingText}>
              {!isSwReady ? 'Initializing Service Worker...' : 'Restoring Preview...'}
            </p>
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
          {isCompilerReady && (
            <iframe
              key={refreshKey}
              ref={iframeRef}
              src={address}
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
