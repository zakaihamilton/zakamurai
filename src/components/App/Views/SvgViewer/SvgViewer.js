import { TabState } from '@/components/App/Panes/TabBar';
import FileViewToolbar from '@/components/App/Views/FileViewToolbar';
import { Icons } from '@/components/Core/Base/Icons';
import Node from '@/components/Core/Base/Node';
import { createState } from '@/components/Core/Base/State';
import { FILE_VIEW_TYPES } from '@/utils/fileViews';
import React, { useEffect } from 'react';
import styles from './SvgViewer.module.css';

const SvgViewerState = createState('SvgViewerState');

export default function SvgViewer({ tab }) {
  return (
    <Node id={tab?.id || tab?.file?.name || 'SvgViewer'}>
      <SvgViewerInner tab={tab} />
    </Node>
  );
}

function SvgViewerInner({ tab }) {
  const tabState = TabState.useState();
  const svgViewerState = SvgViewerState.useState(null, { svgUrl: null, error: null });
  const { svgUrl = null, error = null } = svgViewerState || {};
  const fileName = tab?.file?.name || '';
  const filePath = tab?.file?.path?.join('/') || fileName;

  useEffect(() => {
    let isActive = true;
    let urlToRevoke = null;

    const setError = (message) => {
      svgViewerState((draft) => {
        draft.error = message;
        draft.svgUrl = null;
      });
    };

    if (tab?.fsHandle) {
      tab.fsHandle
        .getFile()
        .then((file) => {
          if (!isActive) return;
          const url = URL.createObjectURL(file);
          urlToRevoke = url;
          svgViewerState((draft) => {
            draft.svgUrl = url;
            draft.error = null;
          });
        })
        .catch((err) => {
          console.error('Failed to load SVG file:', err);
          if (isActive) setError('Unable to load SVG.');
        });
    } else if (tab?.file?.content != null) {
      const blob = new Blob([tab.file.content], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      urlToRevoke = url;
      svgViewerState((draft) => {
        draft.svgUrl = url;
        draft.error = null;
      });
    } else {
      setError('No SVG content available.');
    }

    return () => {
      isActive = false;
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
      svgViewerState((draft) => {
        draft.svgUrl = null;
        draft.error = null;
      });
    };
  }, [tab?.fsHandle, tab?.file?.content, svgViewerState]);

  const handleSelectView = (viewType) => {
    tabState((draft) => {
      draft.openTabs = draft.openTabs.map((openTab) =>
        openTab.id === tab.id ? { ...openTab, viewType } : openTab,
      );
    });
  };

  return (
    <div className={styles.svgViewer}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <Icons.Image size={16} />
          <span className={styles.filePath}>{filePath}</span>
        </div>
        <FileViewToolbar
          fileName={fileName}
          activeViewType={FILE_VIEW_TYPES.SVG_VIEWER}
          onSelectView={handleSelectView}
        />
      </div>
      <div className={styles.canvas}>
        {error ? (
          <div className={styles.message}>{error}</div>
        ) : svgUrl ? (
          <img src={svgUrl} alt={fileName || 'SVG'} className={styles.svgImage} />
        ) : (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner} />
            <div>Loading SVG...</div>
          </div>
        )}
      </div>
    </div>
  );
}
