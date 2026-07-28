import React from 'react';
import PreviewIframeContainer from './IframeContainer';
import styles from './PreviewArea.module.css';
import PreviewBridge from './PreviewBridge';
import PreviewToolbar from './Toolbar';

export default function PreviewSurface({
  containerRef,
  isMaximized,
  previewHostLabel,
  isLoading,
  scale,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onRefresh,
  onOpenExternal,
  onToggleMaximize,
  hasLoadedOnce,
  showInitOverlay,
  displayError,
  errorCopied,
  onCopyError,
  onDismissError,
  isCompilerReady,
  iframeRef,
  previewIframeUrl,
  sessionId,
  refreshKey,
  onLoad,
  externalPreviewRef,
  externalPreviewNonce,
  previewOrigin,
  onError,
}) {
  return (
    <div ref={containerRef} className={`${styles.wrapper} ${isMaximized ? styles.maximized : ''}`}>
      <PreviewToolbar
        previewHostLabel={previewHostLabel}
        isLoading={isLoading}
        scale={scale}
        isMaximized={isMaximized}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onZoomReset={onZoomReset}
        onRefresh={onRefresh}
        onOpenExternal={onOpenExternal}
        onToggleMaximize={onToggleMaximize}
      />
      <PreviewIframeContainer
        isLoading={isLoading}
        hasLoadedOnce={hasLoadedOnce}
        showInitOverlay={showInitOverlay}
        displayError={displayError}
        errorCopied={errorCopied}
        onCopyError={onCopyError}
        onDismissError={onDismissError}
        scale={scale}
        isCompilerReady={isCompilerReady}
        iframeRef={iframeRef}
        previewUrl={previewIframeUrl}
        previewSessionId={sessionId}
        refreshKey={refreshKey}
        onLoad={onLoad}
      />
      <PreviewBridge
        iframeRef={iframeRef}
        externalPreviewRef={externalPreviewRef}
        externalPreviewNonce={externalPreviewNonce}
        iframeHandshakeNonce={refreshKey}
        sessionId={sessionId}
        previewOrigin={previewOrigin}
        onError={onError}
      />
    </div>
  );
}
