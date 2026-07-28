import React from 'react';
import { PreviewErrorBanner } from '../ErrorOverlay';
import styles from '../PreviewArea.module.css';
import { PREVIEW_IFRAME_SANDBOX } from '../previewSandbox';

export default function PreviewIframeContainer({
  isLoading,
  hasLoadedOnce,
  showInitOverlay,
  displayError,
  errorCopied,
  onCopyError,
  onDismissError,
  scale,
  isCompilerReady,
  iframeRef,
  previewUrl,
  previewSessionId,
  refreshKey = 0,
  onLoad,
}) {
  return (
    <div className={styles.viewport}>
      {isLoading && !hasLoadedOnce && (
        <div className={styles.loadingOverlay}>
          <div className={styles.spinner} />
        </div>
      )}
      {showInitOverlay && (
        <div className={styles.loadingOverlay}>
          <div className={styles.spinner} />
          <p className={styles.loadingText}>Restoring Preview...</p>
        </div>
      )}
      <PreviewErrorBanner
        displayError={displayError}
        errorCopied={errorCopied}
        onCopyError={onCopyError}
        onDismissError={onDismissError}
      />
      <div className={styles.scaleWrapper} style={{ '--preview-scale': scale }}>
        {isCompilerReady && (
          <iframe
            key={`preview-${previewSessionId}-${refreshKey}`}
            ref={iframeRef}
            src={previewUrl}
            name={`zakamurai-preview-${previewSessionId}`}
            title="Preview"
            className={styles.iframe}
            onLoad={onLoad}
            // Generated code runs on preview.zakamurai.com and never receives
            // same-origin access to IDE storage, DOM, or service workers.
            sandbox={PREVIEW_IFRAME_SANDBOX}
            style={{ '--iframe-size': scale !== 1 ? `${100 / scale}%` : '100%' }}
          />
        )}
      </div>
    </div>
  );
}
