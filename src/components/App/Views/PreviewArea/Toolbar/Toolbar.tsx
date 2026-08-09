import { Icons } from '@/components/ui/Icons';
import ToolbarButton from '@/components/ui/ToolbarButton';
import type { PreviewToolbarProps } from '../preview-types';
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
}: PreviewToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.addressBar}>
        <Icons.Globe />
        <span className={styles.addressText}>{previewHostLabel}/</span>
        {isLoading && <span className={styles.loadingDot} />}
      </div>

      <div className={styles.toolbarActions}>
        <ToolbarButton
          className={styles.toolBtn}
          onClick={onZoomOut}
          tooltip="Zoom out"
          aria-label="Zoom out"
        >
          −
        </ToolbarButton>
        <ToolbarButton
          className={styles.zoomLevel}
          onClick={onZoomReset}
          tooltip="Reset zoom"
          aria-label="Reset zoom"
        >
          {Math.round(scale * 100)}%
        </ToolbarButton>
        <ToolbarButton
          className={styles.toolBtn}
          onClick={onZoomIn}
          tooltip="Zoom in"
          aria-label="Zoom in"
        >
          +
        </ToolbarButton>
        <div className={styles.separator} />
        <ToolbarButton
          className={styles.toolBtn}
          onClick={onRefresh}
          tooltip="Refresh preview"
          aria-label="Refresh preview"
        >
          <Icons.Refresh />
        </ToolbarButton>
        <ToolbarButton
          className={styles.toolBtn}
          onClick={onOpenExternal}
          tooltip="Open in new tab"
          aria-label="Open in new tab"
        >
          <Icons.ExternalLink />
        </ToolbarButton>
        <ToolbarButton
          className={styles.toolBtn}
          onClick={onToggleMaximize}
          tooltip={isMaximized ? 'Exit maximize' : 'Maximize preview'}
          aria-label={isMaximized ? 'Exit maximize' : 'Maximize preview'}
        >
          {isMaximized ? <Icons.Minimize /> : <Icons.Maximize />}
        </ToolbarButton>
      </div>
    </div>
  );
}
