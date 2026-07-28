'use client';

import { createState } from '@/components/state/State';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PreviewState } from '../../PreviewState';
import styles from './PreviewArea.module.css';
import PreviewBridge from './PreviewBridge';
import {
  detectIframeLoadError,
  fetchScriptErrorBody,
  formatRuntimeError,
  formatUnhandledRejection,
  resolveMissingExportError,
} from './previewErrorUtils';
import { reportPreviewEvidence } from './previewEvidenceBridge';
import {
  createPreviewSession,
  getPreviewConfigurationError,
  getPreviewOrigins,
} from './previewOrigins';
import {
  PREVIEW_IFRAME_SANDBOX,
  PREVIEW_MESSAGE_TYPES,
  isTrustedPreviewMessage,
  parsePreviewMessage,
  sanitizePreviewPath,
} from './previewSandbox';

import { PreviewErrorActions } from './ErrorOverlay';
import PreviewIframeContainer from './IframeContainer';
import PreviewToolbar from './Toolbar';

const SW_INIT_TIMEOUT_MS = 15000;

export const PreviewAreaUiState = createState('PreviewAreaUiState');

export default function PreviewArea() {
  const previewState = PreviewState.useState([
    'htmlContent',
    'isCompilerReady',
    'restoreError',
    'compileError',
    'serverError',
    'previewAddress',
  ]);
  const {
    htmlContent,
    isCompilerReady,
    restoreError = null,
    compileError = null,
    serverError = null,
    previewAddress = '/preview/dist/index.html',
  } = previewState;
  const iframeRef = useRef(null);
  const externalPreviewRef = useRef(null);
  const [externalPreviewNonce, setExternalPreviewNonce] = useState(0);
  const previewSessionRef = useRef(createPreviewSession());
  const listenersRef = useRef(null);
  const previewAreaUiState = PreviewAreaUiState.useState(null, {
    isLoading: false,
    scale: 1,
    error: null,
    refreshKey: Date.now(),
    isSwReady: !!(typeof navigator !== 'undefined' && navigator.serviceWorker?.controller),
    isMaximized: false,
    address: '/preview/dist/index.html',
    host: '',
  });
  const {
    isLoading = false,
    scale = 1,
    error = null,
    refreshKey = Date.now(),
    isSwReady = false,
    isMaximized = false,
    address = '/preview/dist/index.html',
  } = previewAreaUiState || {};
  const containerRef = useRef(null);
  const [errorCopied, setErrorCopied] = useState(false);
  const displayError = error || restoreError || compileError || serverError;
  const origins = getPreviewOrigins({
    windowOrigin: typeof window === 'undefined' ? '' : window.location.origin,
  });
  const previewConfigurationError = getPreviewConfigurationError(origins);
  const previewUrl = origins.previewOrigin
    ? `${origins.previewOrigin}/?session=${previewSessionRef.current}`
    : null;
  const previewHostLabel = origins.previewOrigin ? new URL(origins.previewOrigin).host : '';

  useEffect(() => {
    void displayError;
    setErrorCopied(false);
  }, [displayError]);

  const handleCopyError = useCallback(async () => {
    if (!displayError || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(displayError);
    setErrorCopied(true);
    window.setTimeout(() => setErrorCopied(false), 2000);
  }, [displayError]);

  const removeIframeListeners = useCallback(() => {
    if (!listenersRef.current) return;
    const { win, onError, onRejection } = listenersRef.current;
    win.removeEventListener('error', onError, true);
    win.removeEventListener('unhandledrejection', onRejection);
    listenersRef.current = null;
  }, []);

  useEffect(() => () => removeIframeListeners(), [removeIframeListeners]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    previewAreaUiState((draft) => {
      draft.host = window.location.host;
    });
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
    if (!previewAddress) return;
    previewAreaUiState((draft) => {
      if (draft.address !== previewAddress) {
        draft.address = previewAddress;
      }
    });
  }, [previewAddress, previewAreaUiState]);

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    if (!htmlContent) {
      setHasLoadedOnce(false);
      return;
    }
    previewSessionRef.current = createPreviewSession();
    previewAreaUiState((draft) => {
      draft.isLoading = true;
      draft.error = null;
      draft.refreshKey = Date.now();
    });
  }, [htmlContent, previewAreaUiState]);

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
  }, [previewAreaUiState, previewState, restoreError, compileError, serverError]);

  const setPreviewError = useCallback(
    (message) => {
      if (!message) return;
      previewAreaUiState((draft) => {
        draft.error = message;
      });
      previewState((draft) => {
        draft.serverError = message;
      });
    },
    [previewAreaUiState, previewState],
  );

  const scanModuleScriptsForErrors = useCallback(async () => {
    if (!iframeRef.current) return;
    try {
      const doc = iframeRef.current.contentDocument;
      const scripts = doc?.querySelectorAll('script[type="module"][src]') || [];
      for (const script of scripts) {
        const fetched = await fetchScriptErrorBody(script.src);
        if (fetched) {
          setPreviewError(fetched);
          return;
        }
      }
    } catch (_e) {
      // Ignore cross-origin errors
    }
  }, [setPreviewError]);

  const scanIframeForErrors = useCallback(() => {
    if (!iframeRef.current) return;
    try {
      const loadError = detectIframeLoadError(iframeRef.current.contentDocument);
      if (loadError) {
        setPreviewError(loadError);
      }
    } catch (_e) {
      // Ignore cross-origin errors
    }
  }, [setPreviewError]);

  useEffect(() => {
    const onMessage = (event) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!isTrustedPreviewMessage(event, iframeWindow, origins.previewOrigin)) return;
      const payload = parsePreviewMessage(event.data);
      if (!payload) return;
      if (
        payload.type === PREVIEW_MESSAGE_TYPES.RUNTIME_ERROR ||
        payload.type === PREVIEW_MESSAGE_TYPES.UNHANDLED_REJECTION
      ) {
        if (payload.message) setPreviewError(payload.message);
      } else if (payload.type === PREVIEW_MESSAGE_TYPES.NAVIGATE && payload.path) {
        const safePath = sanitizePreviewPath(payload.path);
        if (!safePath) return;
        previewAreaUiState((draft) => {
          draft.address = safePath;
        });
      } else if (payload.type === PREVIEW_MESSAGE_TYPES.EVIDENCE) {
        reportPreviewEvidence(payload);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origins.previewOrigin, previewAreaUiState, setPreviewError]);

  const handleLoad = useCallback(() => {
    setHasLoadedOnce(true);
    previewAreaUiState((draft) => {
      draft.isLoading = false;
    });

    removeIframeListeners();

    if (!iframeRef.current) return;

    // Prefer same-origin listeners when available; sandboxed opaque iframes rely on postMessage.
    try {
      const win = iframeRef.current.contentWindow;
      const doc = iframeRef.current.contentDocument;
      if (!win || !doc) return;

      const path = win.location.pathname;

      if (path && path !== 'blank') {
        previewAreaUiState((draft) => {
          draft.address = path;
        });
      }

      const loadError = detectIframeLoadError(doc);
      if (loadError) {
        setPreviewError(loadError);
        return;
      }

      const onError = (event) => {
        void (async () => {
          const missingExportError = await resolveMissingExportError(event);
          if (missingExportError) {
            setPreviewError(missingExportError);
            return;
          }

          let message = formatRuntimeError(event);
          const scriptUrl = event.target?.src || event.filename;
          if (scriptUrl) {
            const fetched = await fetchScriptErrorBody(scriptUrl);
            if (fetched) message = fetched;
          }
          setPreviewError(message);
        })();
      };

      const onRejection = (event) => {
        void (async () => {
          const reason = event.reason;
          const missingExportError =
            reason instanceof Error
              ? await resolveMissingExportError({
                  message: reason.message,
                  filename: reason.fileName,
                })
              : typeof reason === 'object' && reason?.message
                ? await resolveMissingExportError(reason)
                : null;
          if (missingExportError) {
            setPreviewError(missingExportError);
            return;
          }
          setPreviewError(formatUnhandledRejection(event));
        })();
      };

      win.addEventListener('error', onError, true);
      win.addEventListener('unhandledrejection', onRejection);
      listenersRef.current = { win, onError, onRejection };

      window.setTimeout(() => {
        scanIframeForErrors();
        void scanModuleScriptsForErrors();
      }, 500);
      window.setTimeout(() => {
        scanIframeForErrors();
        void scanModuleScriptsForErrors();
      }, 2000);
    } catch (_e) {
      // Opaque sandboxed preview — runtime errors arrive via postMessage bridge.
    }
  }, [
    previewAreaUiState,
    removeIframeListeners,
    scanIframeForErrors,
    scanModuleScriptsForErrors,
    setPreviewError,
  ]);

  const handleRefresh = useCallback(() => {
    previewSessionRef.current = createPreviewSession();
    previewAreaUiState((draft) => {
      draft.isLoading = true;
      draft.error = null;
      draft.refreshKey = Date.now();
    });
  }, [previewAreaUiState]);

  const handleOpenExternal = useCallback(() => {
    const previewWindow = window.open(previewUrl, `zakamurai-preview-${previewSessionRef.current}`);
    if (!previewWindow) {
      setPreviewError('The browser blocked the preview tab. Allow pop-ups and try again.');
      return;
    }
    externalPreviewRef.current = previewWindow;
    setExternalPreviewNonce((nonce) => nonce + 1);
  }, [previewUrl, setPreviewError]);

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
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Icons.AlertCircle size={28} />
          </div>
          <h2 className={styles.emptyTitle}>Preview Error</h2>
          <div className={styles.emptyError} role="alert">
            {displayError}
          </div>
          <PreviewErrorActions
            copied={errorCopied}
            onCopy={handleCopyError}
            onDismiss={handleDismissError}
          />
        </div>
      );
    }

    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>
          <Icons.Globe />
        </div>
        <h2 className={styles.emptyTitle}>No Preview Available</h2>
        <p className={styles.emptyText}>
          Build your project first. The preview will load{' '}
          <code className={styles.code}>dist/index.html</code> from the build output.
        </p>
      </div>
    );
  }

  if (previewConfigurationError) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>
          <Icons.AlertCircle size={28} />
        </div>
        <h2 className={styles.emptyTitle}>Preview Setup Required</h2>
        <div className={styles.emptyError} role="alert">
          {previewConfigurationError}
        </div>
      </div>
    );
  }

  const showInitOverlay = !isCompilerReady && !displayError;

  return (
    <div ref={containerRef} className={`${styles.wrapper} ${isMaximized ? styles.maximized : ''}`}>
      <PreviewToolbar
        previewHostLabel={previewHostLabel}
        isLoading={isLoading}
        scale={scale}
        isMaximized={isMaximized}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        onRefresh={handleRefresh}
        onOpenExternal={handleOpenExternal}
        onToggleMaximize={toggleMaximize}
      />

      <PreviewIframeContainer
        isLoading={isLoading}
        hasLoadedOnce={hasLoadedOnce}
        showInitOverlay={showInitOverlay}
        displayError={displayError}
        errorCopied={errorCopied}
        onCopyError={handleCopyError}
        onDismissError={handleDismissError}
        scale={scale}
        isCompilerReady={isCompilerReady}
        iframeRef={iframeRef}
        previewUrl={previewUrl}
        previewSessionId={previewSessionRef.current}
        onLoad={handleLoad}
      />
      <PreviewBridge
        iframeRef={iframeRef}
        externalPreviewRef={externalPreviewRef}
        externalPreviewNonce={externalPreviewNonce}
        sessionId={previewSessionRef.current}
        previewOrigin={origins.previewOrigin}
        onError={setPreviewError}
      />
    </div>
  );
}
