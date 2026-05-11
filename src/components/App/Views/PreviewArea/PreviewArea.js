'use client';

import { Icons } from '@/components/Core/Base/Icons';
import { createState } from '@/components/Core/Base/State';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import React, { useCallback, useEffect, useRef } from 'react';
import styles from './PreviewArea.module.css';

const PreviewAreaUiState = createState('PreviewAreaUiState');

export default function PreviewArea({ htmlContent, isCompilerReady }) {
  const iframeRef = useRef(null);
  const previewAreaUiState = PreviewAreaUiState.useState(null, {
    isLoading: false,
    scale: 1,
    error: null,
    refreshKey: Date.now(),
    isSwReady: !!(typeof navigator !== 'undefined' && navigator.serviceWorker?.controller),
    isMaximized: false,
    address: '/preview/',
    host: '',
  });
  const {
    isLoading = false,
    scale = 1,
    refreshKey = Date.now(),
    isSwReady = false,
    isMaximized = false,
    address = '/preview/',
    host = '',
  } = previewAreaUiState || {};
  const containerRef = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      previewAreaUiState((draft) => {
        draft.host = window.location.host;
      });
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
          previewAreaUiState((draft) => {
            draft.address = `${baseBeforePreview}${address}`;
          });
        }
      }
    }
  }, [address, previewAreaUiState]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleControllerChange = () => {
      previewAreaUiState((draft) => {
        draft.isSwReady = !!navigator.serviceWorker.controller;
      });
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () =>
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
  }, [previewAreaUiState]);

  useEffect(() => {
    if (!htmlContent) return;
    previewAreaUiState((draft) => {
      draft.isLoading = true;
      draft.error = null;
      // When htmlContent changes, we simply increment the key to reload the virtual path
      draft.refreshKey = Date.now();
    });
  }, [htmlContent, previewAreaUiState]);

  const handleLoad = useCallback(() => {
    previewAreaUiState((draft) => {
      draft.isLoading = false;
    });
    if (iframeRef.current) {
      try {
        const path = iframeRef.current.contentWindow.location.pathname;
        if (path && path !== 'blank') {
          previewAreaUiState((draft) => {
            draft.address = path;
          });
        }
      } catch (_e) {
        // Ignore cross-origin errors
      }
    }
  }, [previewAreaUiState]);

  const handleRefresh = useCallback(() => {
    previewAreaUiState((draft) => {
      draft.isLoading = true;
      draft.refreshKey = Date.now();
    });
  }, [previewAreaUiState]);

  const handleOpenExternal = useCallback(() => {
    window.open(address, '_blank');
  }, [address]);

  const toggleMaximize = useCallback(() => {
    previewAreaUiState((draft) => {
      draft.isMaximized = !draft.isMaximized;
    });
  }, [previewAreaUiState]);

  const handleZoomIn = () =>
    previewAreaUiState((draft) => {
      draft.scale = Math.min(draft.scale + 0.1, 2);
    });
  const handleZoomOut = () =>
    previewAreaUiState((draft) => {
      draft.scale = Math.max(draft.scale - 0.1, 0.3);
    });
  const handleZoomReset = () =>
    previewAreaUiState((draft) => {
      draft.scale = 1;
    });

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
            <button
              type="button"
              className={styles.toolBtn}
              onClick={handleZoomOut}
              aria-label="Zoom out"
            >
              −
            </button>
          </Tooltip>
          <button
            type="button"
            className={styles.zoomLevel}
            onClick={handleZoomReset}
            aria-label="Reset zoom"
          >
            {Math.round(scale * 100)}%
          </button>
          <Tooltip content="Zoom in">
            <button
              type="button"
              className={styles.toolBtn}
              onClick={handleZoomIn}
              aria-label="Zoom in"
            >
              +
            </button>
          </Tooltip>
          <div className={styles.separator} />
          <Tooltip content="Refresh preview">
            <button
              type="button"
              className={styles.toolBtn}
              onClick={handleRefresh}
              aria-label="Refresh preview"
            >
              <Icons.Refresh />
            </button>
          </Tooltip>
          <Tooltip content="Open in new tab">
            <button
              type="button"
              className={styles.toolBtn}
              onClick={handleOpenExternal}
              aria-label="Open in new tab"
            >
              <Icons.ExternalLink />
            </button>
          </Tooltip>
          <Tooltip content={isMaximized ? 'Exit maximize' : 'Maximize preview'}>
            <button
              type="button"
              className={styles.toolBtn}
              onClick={toggleMaximize}
              aria-label={isMaximized ? 'Exit maximize' : 'Maximize preview'}
            >
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
          {isCompilerReady && isSwReady && (
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
