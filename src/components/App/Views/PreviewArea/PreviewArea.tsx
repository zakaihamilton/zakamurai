'use client';

import { createState } from '@/components/state/State';
import type { PreviewAreaUiStateShape } from '@/components/state/domain-types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PreviewState } from '../../PreviewState';
import { requireStore } from '../../types';
import { PreviewErrorState, PreviewUnavailableState } from './PreviewEmptyState';
import PreviewSurface from './PreviewSurface';
import { isOpaqueScriptError } from './previewErrorUtils';
import { getPreviewConfigurationError, getPreviewOrigins } from './previewOrigins';
import usePreviewRuntimeBridge from './usePreviewRuntimeBridge';
import usePreviewSessionLifecycle from './usePreviewSessionLifecycle';

const SW_INIT_TIMEOUT_MS = 15000;

export const PreviewAreaUiState = createState<PreviewAreaUiStateShape>('PreviewAreaUiState');

export default function PreviewArea() {
  const previewState = requireStore(
    PreviewState.useState([
      'htmlContent',
      'isCompilerReady',
      'restoreError',
      'compileError',
      'serverError',
      'previewAddress',
      'previewSessionId',
    ]),
  );
  const {
    htmlContent,
    isCompilerReady,
    restoreError = null,
    compileError = null,
    serverError = null,
    previewAddress = '/preview/dist/index.html',
    previewSessionId = null,
  } = previewState;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const isLoadingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previewAreaUiState = requireStore(
    PreviewAreaUiState.useState(null, {
      isLoading: false,
      scale: 1,
      error: null,
      refreshKey: Date.now(),
      isSwReady: !!(typeof navigator !== 'undefined' && navigator.serviceWorker?.controller),
      isMaximized: false,
      address: '/preview/dist/index.html',
      host: '',
    }),
  );
  const {
    isLoading = false,
    scale = 1,
    error = null,
    refreshKey = Date.now(),
    isSwReady = false,
    isMaximized = false,
    address = '/preview/dist/index.html',
  } = previewAreaUiState || {};
  isLoadingRef.current = isLoading;

  const [errorCopied, setErrorCopied] = useState(false);
  const displayError = error || restoreError || compileError || serverError;
  const origins = getPreviewOrigins({
    windowOrigin: typeof window === 'undefined' ? '' : window.location.origin,
  });
  const previewConfigurationError = getPreviewConfigurationError(origins);

  const setPreviewError = useCallback(
    (message: string) => {
      if (!message || isOpaqueScriptError(message) || isLoadingRef.current) return;
      previewAreaUiState((draft) => {
        draft.error = message;
      });
      previewState((draft) => {
        draft.serverError = message;
        if (message.includes('Preview server is not ready')) {
          draft.isCompilerReady = false;
        }
      });
    },
    [previewAreaUiState, previewState],
  );

  const {
    previewSessionRef,
    previewUrl,
    previewIframeUrl,
    externalPreviewRef,
    externalPreviewNonce,
    hasLoadedOnce,
    setHasLoadedOnce,
    handleOpenExternal,
  } = usePreviewSessionLifecycle({
    previewSessionId,
    htmlContent,
    previewAddress,
    previewState,
    previewAreaUiState,
    origins,
    refreshKey,
    address,
    onBlockedExternalPreview: setPreviewError,
  });
  const handleLoad = usePreviewRuntimeBridge({
    iframeRef,
    previewAreaUiState,
    previewUrl,
    previewOrigin: origins.previewOrigin || '',
    setPreviewError,
    setHasLoadedOnce,
  });

  useEffect(() => {
    void displayError;
    setErrorCopied(false);
  }, [displayError]);

  useEffect(() => {
    if (!htmlContent || isSwReady) return;
    const timer = window.setTimeout(() => {
      previewAreaUiState((draft) => {
        if (!draft.isSwReady) {
          draft.error = 'Service worker did not activate. Try building the project again.';
        }
      });
    }, SW_INIT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [htmlContent, isSwReady, previewAreaUiState]);

  const handleCopyError = useCallback(async () => {
    if (!displayError || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(displayError);
    setErrorCopied(true);
    window.setTimeout(() => setErrorCopied(false), 2000);
  }, [displayError]);

  const handleDismissError = useCallback(() => {
    previewAreaUiState((draft) => {
      draft.error = null;
    });
    if (restoreError || compileError || serverError) {
      previewState((draft) => {
        draft.restoreError = null;
        draft.compileError = null;
        draft.serverError = null;
      });
    }
  }, [compileError, previewAreaUiState, previewState, restoreError, serverError]);

  const handleRefresh = useCallback(() => {
    previewAreaUiState((draft) => {
      draft.isLoading = true;
      draft.error = null;
      draft.refreshKey = Date.now();
    });
  }, [previewAreaUiState]);
  const toggleMaximize = useCallback(() => {
    previewAreaUiState((draft) => {
      draft.isMaximized = !draft.isMaximized;
    });
  }, [previewAreaUiState]);
  const handleZoomIn = () =>
    previewAreaUiState((draft) => {
      draft.scale = Math.round(Math.min(draft.scale + 0.1, 2) * 10) / 10;
    });
  const handleZoomOut = () =>
    previewAreaUiState((draft) => {
      draft.scale = Math.round(Math.max(draft.scale - 0.1, 0.3) * 10) / 10;
    });
  const handleZoomReset = () =>
    previewAreaUiState((draft) => {
      draft.scale = 1;
    });

  if (!htmlContent) {
    if (displayError) {
      return (
        <PreviewErrorState
          title="Preview Error"
          message={displayError}
          copied={errorCopied}
          onCopy={handleCopyError}
          onDismiss={handleDismissError}
        />
      );
    }
    return <PreviewUnavailableState />;
  }
  if (previewConfigurationError) {
    return <PreviewErrorState title="Preview Setup Required" message={previewConfigurationError} />;
  }

  return (
    <PreviewSurface
      containerRef={containerRef}
      isMaximized={isMaximized}
      previewHostLabel={origins.previewOrigin ? new URL(origins.previewOrigin).host : ''}
      isLoading={isLoading}
      scale={scale}
      onZoomIn={handleZoomIn}
      onZoomOut={handleZoomOut}
      onZoomReset={handleZoomReset}
      onRefresh={handleRefresh}
      onOpenExternal={handleOpenExternal}
      onToggleMaximize={toggleMaximize}
      hasLoadedOnce={hasLoadedOnce}
      showInitOverlay={!isCompilerReady && !displayError}
      displayError={displayError}
      errorCopied={errorCopied}
      onCopyError={handleCopyError}
      onDismissError={handleDismissError}
      isCompilerReady={isCompilerReady}
      iframeRef={iframeRef}
      previewIframeUrl={previewIframeUrl}
      sessionId={previewSessionRef.current}
      refreshKey={refreshKey}
      onLoad={handleLoad}
      externalPreviewRef={externalPreviewRef}
      externalPreviewNonce={externalPreviewNonce}
      previewOrigin={origins.previewOrigin || ''}
      onError={setPreviewError}
    />
  );
}
