import { TabState } from '@/components/App/Panes/TabBar';
import FileViewToolbar from '@/components/App/Views/FileViewToolbar';
import { Icons } from '@/components/Core/Base/Icons';
import Node from '@/components/Core/Base/Node';
import { createState } from '@/components/Core/Base/State';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { FILE_VIEW_TYPES } from '@/utils/fileViews';
import React, { useEffect } from 'react';
import styles from './ImageViewer.module.css';

const ImageViewerState = createState('ImageViewerState');

export default function ImageViewer({ tab }) {
  return (
    <Node id={tab?.id || tab?.file?.name || 'ImageViewer'}>
      <ImageViewerInner tab={tab} />
    </Node>
  );
}

function ImageViewerInner({ tab }) {
  const tabState = TabState.useState();
  const imageViewerState = ImageViewerState.useState(null, {
    imageUrl: null,
    error: null,
    scale: 1,
    showGrid: false,
  });
  const { imageUrl = null, error = null, scale = 1, showGrid = false } = imageViewerState || {};
  const fileName = tab?.file?.name || '';
  const filePath = tab?.file?.path?.join('/') || fileName;
  const isSvg = fileName.toLowerCase().endsWith('.svg');

  useEffect(() => {
    let isActive = true;
    let urlToRevoke = null;

    const setError = (message) => {
      imageViewerState((draft) => {
        draft.error = message;
        draft.imageUrl = null;
      });
    };

    if (tab?.fsHandle) {
      tab.fsHandle
        .getFile()
        .then((f) => {
          if (!isActive) return;
          const url = URL.createObjectURL(f);
          urlToRevoke = url;
          imageViewerState((draft) => {
            draft.imageUrl = url;
            draft.error = null;
          });
        })
        .catch((err) => {
          console.error('Failed to get file from handle:', err);
          if (isActive) setError('Unable to load file.');
        });
    } else if (tab?.file?.content != null) {
      const isSvg = fileName.toLowerCase().endsWith('.svg');
      const type = isSvg ? 'image/svg+xml' : 'application/octet-stream';
      const blob = new Blob([tab.file.content], { type });
      const url = URL.createObjectURL(blob);
      urlToRevoke = url;
      imageViewerState((draft) => {
        draft.imageUrl = url;
        draft.error = null;
      });
    } else {
      setError('No media content available.');
    }

    return () => {
      isActive = false;
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
      }
      imageViewerState((draft) => {
        draft.imageUrl = null;
        draft.error = null;
      });
    };
  }, [tab?.fsHandle, tab?.file?.content, fileName, imageViewerState]);

  const handleSelectView = (viewType) => {
    tabState((draft) => {
      draft.openTabs = draft.openTabs.map((openTab) =>
        openTab.id === tab.id ? { ...openTab, viewType } : openTab,
      );
    });
  };

  const handleZoomIn = () => {
    imageViewerState((draft) => {
      draft.scale = Math.min(draft.scale + 0.25, 4);
    });
  };

  const handleZoomOut = () => {
    imageViewerState((draft) => {
      draft.scale = Math.max(draft.scale - 0.25, 0.25);
    });
  };

  const handleZoomReset = () => {
    imageViewerState((draft) => {
      draft.scale = 1;
    });
  };

  const handleToggleGrid = () => {
    imageViewerState((draft) => {
      draft.showGrid = !draft.showGrid;
    });
  };

  const isVideo = fileName.match(/\.(webm|mp4|ogg)$/i);

  return (
    <div className={styles.imageViewer}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <Icons.Image size={16} />
          <span className={styles.filePath}>{filePath}</span>
        </div>
        <div className={styles.zoomControls}>
          <Tooltip content="Zoom Out">
            <button
              type="button"
              className={styles.zoomBtn}
              onClick={handleZoomOut}
              disabled={scale <= 0.25}
            >
              −
            </button>
          </Tooltip>
          <Tooltip content="Reset Zoom">
            <button type="button" className={styles.zoomValue} onClick={handleZoomReset}>
              {Math.round(scale * 100)}%
            </button>
          </Tooltip>
          <Tooltip content="Zoom In">
            <button
              type="button"
              className={styles.zoomBtn}
              onClick={handleZoomIn}
              disabled={scale >= 4}
            >
              +
            </button>
          </Tooltip>
          <div className={styles.separator} />
          <Tooltip content="Toggle Pixel Grid">
            <button
              type="button"
              className={`${styles.zoomBtn} ${showGrid ? styles.activeBtn : ''}`}
              onClick={handleToggleGrid}
            >
              <Icons.Grid size={14} />
            </button>
          </Tooltip>
        </div>
        <FileViewToolbar
          fileName={fileName}
          activeViewType={FILE_VIEW_TYPES.IMAGE_VIEWER}
          onSelectView={handleSelectView}
        />
      </div>
      <div className={styles.canvas}>
        {error ? (
          <div className={styles.message}>{error}</div>
        ) : imageUrl ? (
          <div
            className={`${styles.imageContainer} ${showGrid ? styles.showGridPattern : ''}`}
            style={{ transform: `scale(${scale})` }}
          >
            {isVideo ? (
              // biome-ignore lint/a11y/useMediaCaption: we don't have captions for these raw files
              <video
                src={imageUrl}
                controls
                className={`${styles.image} ${showGrid ? styles.pixelated : ''}`}
              />
            ) : (
              <img
                src={imageUrl}
                alt={fileName || 'Image'}
                className={`${styles.image} ${showGrid ? styles.pixelated : ''}`}
                style={
                  isSvg
                    ? { width: '512px', height: '512px', maxWidth: '100%', maxHeight: '100%' }
                    : {}
                }
              />
            )}
          </div>
        ) : (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner} />
            <div style={{ marginLeft: '10px' }}>Loading media...</div>
          </div>
        )}
      </div>
    </div>
  );
}
