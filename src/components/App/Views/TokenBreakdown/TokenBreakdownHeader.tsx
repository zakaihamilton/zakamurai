import FileViewToolbar from '@/components/App/Views/FileViewToolbar';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { FILE_VIEW_TYPES } from '@/utils/fileViews';
import React from 'react';
import styles from './TokenBreakdownHeader.module.css';

export default function TokenBreakdownHeader({
  filePath,
  fileName,
  copied,
  copiedCombined,
  canSwitchFileViews,
  onCopy,
  onCopyCombined,
  onVerifyMatch,
  onSelectView,
}) {
  const isDevelopment = process.env.NODE_ENV === 'development';
  return (
    <div className={styles.header}>
      <div className={styles.titleGroup}>
        <span className={styles.titleIcon}>
          <Icons.Tokens size={16} />
        </span>
        <span className={styles.filePath}>{filePath}</span>
      </div>
      <div className={styles.headerActions}>
        {isDevelopment && (
          <Tooltip content="Verify token report match">
            <button
              type="button"
              className={styles.copyButton}
              onClick={onVerifyMatch}
              aria-label="Verify token report match"
            >
              <Icons.Check />
            </button>
          </Tooltip>
        )}
        <Tooltip content={copied ? 'Copied!' : 'Copy token breakdown'}>
          <button
            type="button"
            className={`${styles.copyButton} ${copied ? styles.copyButtonCopied : ''}`}
            onClick={onCopy}
            aria-live="polite"
            aria-label={copied ? 'Copied!' : 'Copy token breakdown'}
          >
            {copied ? <Icons.Check /> : <Icons.Copy />}
          </button>
        </Tooltip>
        {isDevelopment && (
          <Tooltip content={copiedCombined ? 'Copied!' : 'Copy troubleshooting prompt'}>
            <button
              type="button"
              className={`${styles.copyButton} ${copiedCombined ? styles.copyButtonCopied : ''}`}
              onClick={onCopyCombined}
              aria-live="polite"
              aria-label={copiedCombined ? 'Copied!' : 'Copy troubleshooting prompt'}
            >
              {copiedCombined ? <Icons.Check /> : <Icons.Brain />}
            </button>
          </Tooltip>
        )}
        {canSwitchFileViews && (
          <FileViewToolbar
            fileName={fileName}
            activeViewType={FILE_VIEW_TYPES.TOKEN_BREAKDOWN}
            onSelectView={onSelectView}
          />
        )}
      </div>
    </div>
  );
}
