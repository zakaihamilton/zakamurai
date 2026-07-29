import type { CssCustomProperties } from '@/components/App/types';
import type { PreviewIframeContainerProps } from '../preview-types';
import { PreviewErrorBanner } from '../ErrorOverlay';
import { PREVIEW_IFRAME_SANDBOX } from '../previewSandbox';
import styles from './IframeContainer.module.css';

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
}: PreviewIframeContainerProps) {
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
      <div
        className={styles.scaleWrapper}
        style={{ '--preview-scale': scale } as CssCustomProperties}
      >
        {isCompilerReady && (
          <iframe
            key={`preview-${previewSessionId}-${refreshKey}`}
            ref={iframeRef}
            src={previewUrl || undefined}
            name={`zakamurai-preview-${previewSessionId}`}
            title="Preview"
            className={styles.iframe}
            onLoad={onLoad}
            sandbox={PREVIEW_IFRAME_SANDBOX}
            style={
              { '--iframe-size': scale !== 1 ? `${100 / scale}%` : '100%' } as CssCustomProperties
            }
          />
        )}
      </div>
    </div>
  );
}
