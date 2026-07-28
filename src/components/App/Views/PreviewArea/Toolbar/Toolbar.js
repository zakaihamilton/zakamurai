import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import React from 'react';
import styles from './Toolbar.module.css';

export default function PreviewToolbar({
  previewHostLabel,
  isLoading,
  scale,
  isMaximized,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onRefresh,
  onOpenExternal,
  onToggleMaximize,
}) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.addressBar}>
        <Icons.Globe />
        <span className={styles.addressText}>{previewHostLabel}/</span>
        {isLoading && <span className={styles.loadingDot} />}
      </div>

      <div className={styles.toolbarActions}>
        <Tooltip content="Zoom out">
          <button type="button" className={styles.toolBtn} onClick={onZoomOut}>
            −
          </button>
        </Tooltip>
        <button type="button" className={styles.zoomLevel} onClick={onZoomReset}>
          {Math.round(scale * 100)}%
        </button>
        <Tooltip content="Zoom in">
          <button type="button" className={styles.toolBtn} onClick={onZoomIn}>
            +
          </button>
        </Tooltip>
        <div className={styles.separator} />
        <Tooltip content="Refresh preview">
          <button type="button" className={styles.toolBtn} onClick={onRefresh}>
            <Icons.Refresh />
          </button>
        </Tooltip>
        <Tooltip content="Open in new tab">
          <button type="button" className={styles.toolBtn} onClick={onOpenExternal}>
            <Icons.ExternalLink />
          </button>
        </Tooltip>
        <Tooltip content={isMaximized ? 'Exit maximize' : 'Maximize preview'}>
          <button type="button" className={styles.toolBtn} onClick={onToggleMaximize}>
            {isMaximized ? <Icons.Minimize /> : <Icons.Maximize />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
