import { useCallback, useEffect, useRef, useState } from 'react';
import { buildPreviewUrl, createPreviewSession, getPreviewOrigins } from './previewOrigins';

/** Maintains the stable preview session and rebuild lifecycle, including an optional external tab. */
export default function usePreviewSessionLifecycle({
  previewSessionId,
  htmlContent,
  previewAddress,
  previewState,
  previewAreaUiState,
  origins,
  refreshKey,
  address,
  onBlockedExternalPreview,
}) {
  const previewSessionRef = useRef(previewSessionId || createPreviewSession());
  const externalPreviewRef = useRef(null);
  const [externalPreviewNonce, setExternalPreviewNonce] = useState(0);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  if (previewSessionId && previewSessionRef.current !== previewSessionId) {
    previewSessionRef.current = previewSessionId;
  }

  const previewUrl = buildPreviewUrl(origins, previewSessionRef.current);
  const previewIframeUrl =
    previewUrl && refreshKey
      ? `${previewUrl}${previewUrl.includes('?') ? '&' : '?'}r=${refreshKey}`
      : previewUrl;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    previewAreaUiState((draft) => {
      draft.host = window.location.host;
    });
    const currentPath = window.location.pathname;
    if (!currentPath.includes('/preview/')) return;
    const baseBeforePreview = currentPath.split('/preview/')[0];
    if (baseBeforePreview && baseBeforePreview !== '/' && !address.startsWith(baseBeforePreview)) {
      previewAreaUiState((draft) => {
        draft.address = `${baseBeforePreview}${address}`;
      });
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
      if (draft.address !== previewAddress) draft.address = previewAddress;
    });
  }, [previewAddress, previewAreaUiState]);

  useEffect(() => {
    if (previewSessionId) return;
    const sessionId = previewSessionRef.current;
    previewState((draft) => {
      if (!draft.previewSessionId) draft.previewSessionId = sessionId;
    });
  }, [previewSessionId, previewState]);

  useEffect(() => {
    if (!htmlContent) {
      setHasLoadedOnce(false);
      return;
    }
    previewAreaUiState((draft) => {
      draft.isLoading = true;
      draft.error = null;
      draft.refreshKey = Date.now();
    });
    previewState((draft) => {
      draft.serverError = null;
    });
    const externalWindow = externalPreviewRef.current;
    if (externalWindow && !externalWindow.closed) {
      try {
        externalWindow.location.reload();
      } catch {
        const nextUrl = buildPreviewUrl(
          getPreviewOrigins({
            windowOrigin: typeof window === 'undefined' ? '' : window.location.origin,
          }),
          previewSessionRef.current,
        );
        try {
          if (nextUrl) externalWindow.location.href = nextUrl;
        } catch {
          // Cross-origin navigation may be blocked; the user can refresh the tab.
        }
      }
      setExternalPreviewNonce((nonce) => nonce + 1);
    }
  }, [htmlContent, previewAreaUiState, previewState]);

  const handleOpenExternal = useCallback(() => {
    const previewWindow = window.open(
      previewUrl,
      `zakamurai-preview-tab-${previewSessionRef.current}`,
    );
    if (!previewWindow) {
      onBlockedExternalPreview('The browser blocked the preview tab. Allow pop-ups and try again.');
      return;
    }
    externalPreviewRef.current = previewWindow;
    setExternalPreviewNonce((nonce) => nonce + 1);
  }, [onBlockedExternalPreview, previewUrl]);

  return {
    previewSessionRef,
    previewUrl,
    previewIframeUrl,
    externalPreviewRef,
    externalPreviewNonce,
    hasLoadedOnce,
    setHasLoadedOnce,
    handleOpenExternal,
  };
}
