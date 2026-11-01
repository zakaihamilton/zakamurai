import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import type { PreviewErrorActionsProps, PreviewErrorBannerProps } from '../preview-types';
import styles from './ErrorOverlay.module.css';

export function PreviewErrorActions({
  copied,
  onCopy,
  onDismiss,
  onFixWithAI,
}: PreviewErrorActionsProps) {
  return (
    <div className={styles.errorActions}>
      {onFixWithAI && (
        <Tooltip content="Send error to Local AI to fix automatically">
          <button
            type="button"
            className={styles.fixWithAIBtn}
            onClick={onFixWithAI}
            aria-label="Fix with Local AI"
          >
            <Icons.Sparkles size={12} />
            <span>Fix with AI</span>
          </button>
        </Tooltip>
      )}
      <Tooltip content={copied ? 'Copied!' : 'Copy error'}>
        <button
          type="button"
          className={styles.errorActionBtn}
          onClick={onCopy}
          aria-label={copied ? 'Copied!' : 'Copy error'}
        >
          {copied ? <Icons.Check /> : <Icons.Copy />}
        </button>
      </Tooltip>
      <Tooltip content="Dismiss error">
        <button
          type="button"
          className={styles.errorActionBtn}
          onClick={onDismiss}
          aria-label="Dismiss error"
        >
          <Icons.Close />
        </button>
      </Tooltip>
    </div>
  );
}

export function PreviewErrorBanner({
  displayError,
  errorCopied,
  onCopyError,
  onDismissError,
  onFixWithAI,
}: PreviewErrorBannerProps) {
  if (!displayError) return null;
  return (
    <div className={styles.errorBanner} role="alert">
      <Icons.AlertCircle size={14} />
      <span className={styles.errorText}>{displayError}</span>
      <PreviewErrorActions
        copied={errorCopied}
        onCopy={onCopyError}
        onDismiss={onDismissError}
        onFixWithAI={onFixWithAI}
      />
    </div>
  );
}
