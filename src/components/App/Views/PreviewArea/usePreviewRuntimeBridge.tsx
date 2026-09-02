import { markPerformance, measurePerformance } from '@/components/Performance';
import { useCallback, useEffect, useRef } from 'react';
import type { PreviewIframeListeners, UsePreviewRuntimeBridgeParams } from './preview-types';
import {
  detectIframeLoadError,
  fetchScriptErrorBody,
  formatRuntimeError,
  formatUnhandledRejection,
  resolveMissingExportError,
} from './previewErrorUtils';
import { reportPreviewEvidence, reportPreviewRuntimeError } from './previewEvidenceBridge';
import {
  PREVIEW_MESSAGE_TYPES,
  isTrustedPreviewMessage,
  parsePreviewMessage,
  sanitizePreviewPath,
} from './previewSandbox';

/** Bridges trusted preview events and same-origin iframe diagnostics into the preview controller. */
export default function usePreviewRuntimeBridge({
  iframeRef,
  previewAreaUiState,
  previewUrl,
  previewOrigin,
  setPreviewError,
  setHasLoadedOnce,
}: UsePreviewRuntimeBridgeParams) {
  const listenersRef = useRef<PreviewIframeListeners | null>(null);
  const removeIframeListeners = useCallback(() => {
    if (!listenersRef.current) return;
    const { win, onError, onRejection } = listenersRef.current;
    win.removeEventListener('error', onError, true);
    win.removeEventListener('unhandledrejection', onRejection);
    listenersRef.current = null;
  }, []);

  useEffect(() => () => removeIframeListeners(), [removeIframeListeners]);

  const scanModuleScriptsForErrors = useCallback(async () => {
    if (!iframeRef.current) return;
    try {
      const doc = iframeRef.current.contentDocument;
      const scripts = doc?.querySelectorAll('script[type="module"][src]') || [];
      const previewFetch = doc?.defaultView?.fetch?.bind(doc.defaultView);
      for (const script of scripts) {
        const src = (script as HTMLScriptElement).src;
        const fetched = await fetchScriptErrorBody(src, previewFetch);
        if (fetched) {
          reportPreviewRuntimeError(fetched);
          setPreviewError(fetched);
          return;
        }
      }
    } catch (_e) {
      // Ignore cross-origin errors.
    }
  }, [iframeRef, setPreviewError]);

  const scanIframeForErrors = useCallback(() => {
    if (!iframeRef.current) return;
    try {
      const loadError = detectIframeLoadError(iframeRef.current.contentDocument);
      if (loadError) {
        reportPreviewRuntimeError(loadError);
        setPreviewError(loadError);
      }
    } catch (_e) {
      // Ignore cross-origin errors.
    }
  }, [iframeRef, setPreviewError]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!isTrustedPreviewMessage(event, iframeWindow, previewOrigin)) return;
      const payload = parsePreviewMessage(event.data);
      if (!payload) return;
      if (
        payload.type === PREVIEW_MESSAGE_TYPES.RUNTIME_ERROR ||
        payload.type === PREVIEW_MESSAGE_TYPES.UNHANDLED_REJECTION
      ) {
        if (payload.message) {
          reportPreviewRuntimeError(payload.message);
          setPreviewError(payload.message);
        }
      } else if (payload.type === PREVIEW_MESSAGE_TYPES.NAVIGATE && payload.path) {
        const safePath = sanitizePreviewPath(payload.path);
        if (!safePath) return;
        previewAreaUiState((draft) => {
          draft.address = safePath;
        });
      } else if (payload.type === PREVIEW_MESSAGE_TYPES.EVIDENCE) {
        reportPreviewEvidence(payload);
      } else if (payload.type === PREVIEW_MESSAGE_TYPES.RECONNECT) {
        if (iframeRef.current && previewUrl) iframeRef.current.src = previewUrl;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [iframeRef, previewAreaUiState, previewOrigin, previewUrl, setPreviewError]);

  return useCallback(() => {
    markPerformance('preview-ready');
    measurePerformance('preview-load', 'build-ready', 'preview-ready');
    setHasLoadedOnce(true);
    previewAreaUiState((draft) => {
      draft.isLoading = false;
    });
    removeIframeListeners();
    if (!iframeRef.current) return;

    try {
      const win = iframeRef.current.contentWindow;
      const doc = iframeRef.current.contentDocument;
      if (!win || !doc) return;
      const previewFetch = win.fetch.bind(win);
      const path = win.location.pathname;
      if (path && path !== 'blank') {
        previewAreaUiState((draft) => {
          draft.address = path;
        });
      }
      const loadError = detectIframeLoadError(doc);
      if (loadError) {
        reportPreviewRuntimeError(loadError);
        setPreviewError(loadError);
        return;
      }

      const reportError = (message: string) => {
        reportPreviewRuntimeError(message);
        setPreviewError(message);
      };

      const onError = (event: ErrorEvent) => {
        void (async () => {
          const missingExportError = await resolveMissingExportError(
            {
              message: event.message,
              filename: event.filename,
              lineno: event.lineno,
              colno: event.colno,
            },
            previewFetch,
          );
          if (missingExportError) {
            reportError(missingExportError);
            return;
          }
          let message = formatRuntimeError({
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
          });
          const target = event.target as HTMLScriptElement | null;
          const scriptUrl = target?.src || event.filename;
          if (scriptUrl) {
            const fetched = await fetchScriptErrorBody(scriptUrl, previewFetch);
            if (fetched) message = fetched;
          }
          reportError(message);
        })();
      };
      const onRejection = (event: PromiseRejectionEvent) => {
        void (async () => {
          const reason = event.reason;
          const missingExportError =
            reason instanceof Error
              ? await resolveMissingExportError(
                  {
                    message: reason.message,
                    filename: (reason as Error & { fileName?: string }).fileName,
                  },
                  previewFetch,
                )
              : typeof reason === 'object' && reason?.message
                ? await resolveMissingExportError(
                    reason as { message?: string; filename?: string },
                    previewFetch,
                  )
                : null;
          if (missingExportError) {
            reportError(missingExportError);
            return;
          }
          reportError(formatUnhandledRejection(event));
        })();
      };
      win.addEventListener('error', onError, true);
      win.addEventListener('unhandledrejection', onRejection);
      listenersRef.current = { win, onError, onRejection };
      for (const delay of [500, 2000]) {
        window.setTimeout(() => {
          scanIframeForErrors();
          void scanModuleScriptsForErrors();
        }, delay);
      }
    } catch (_e) {
      // Opaque sandboxed preview — runtime errors arrive via postMessage bridge.
    }
  }, [
    iframeRef,
    previewAreaUiState,
    removeIframeListeners,
    scanIframeForErrors,
    scanModuleScriptsForErrors,
    setHasLoadedOnce,
    setPreviewError,
  ]);
}
