import Resizer from '@/components/Widgets/Resizer/Resizer';
import React from 'react';
import Node from '../../Core/Base/Node';
import styles from '../App.module.css';
import { AppState } from '../AppState';
import { Sidebar, SidebarState, StatusBar, TopBar } from '../Panes';
import { CompletionDebug, ShortcutsHelp } from '../Popups';
import WorkspaceArea from './WorkspaceArea';

export default function AppContent() {
  const appState = AppState.useState();
  const sidebarState = SidebarState.useState();
  const { theme, showShortcuts, showCompletionDebug, isResizing = false, isMobile } = appState;
  const { isSidebarOpen, isSidebarPopupOpen, isAIInputPopupOpen } = sidebarState;

  const handleSidebarResize = (clientX) => {
    if (isSidebarOpen) {
      sidebarState((draft) => {
        draft.sidebarWidth = Math.max(160, Math.min(clientX, 600));
      });
    }
  };

  const handleResizeStart = () => {
    appState((draft) => {
      draft.isResizing = true;
    });
  };

  const handleResizeEnd = () => {
    appState((draft) => {
      draft.isResizing = false;
    });
  };

  const handleSidebarReset = () => {
    sidebarState((draft) => {
      draft.sidebarWidth = 260;
    });
  };

  const closeOverlays = () => {
    if (isMobile) {
      sidebarState((draft) => {
        draft.isSidebarPopupOpen = false;
        draft.isAIInputPopupOpen = false;
      });
    }
  };

  const handleOverlayKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      closeOverlays();
    }
  };

  return (
    <div
      className={`${styles.appWrapper} ${theme === 'light' ? styles.light : ''} ${
        isResizing ? styles.isResizing : ''
      }`}
    >
      {isMobile && (isSidebarPopupOpen || isAIInputPopupOpen) && (
        <div
          className={styles.mobileOverlay}
          onClick={closeOverlays}
          onKeyDown={handleOverlayKeyDown}
          role="button"
          tabIndex={0}
          aria-label="Close overlays"
        />
      )}
      <Sidebar />
      {isSidebarOpen && !isMobile && (
        <Node>
          <Resizer
            onResize={handleSidebarResize}
            onResizeStart={handleResizeStart}
            onResizeEnd={handleResizeEnd}
            onDoubleClick={handleSidebarReset}
          />
        </Node>
      )}
      <div className={styles.mainContent}>
        <TopBar />
        <WorkspaceArea />
        <StatusBar />
      </div>
      <ShortcutsHelp
        isOpen={showShortcuts}
        onClose={() =>
          appState((draft) => {
            draft.showShortcuts = false;
          })
        }
      />
      <CompletionDebug
        isOpen={showCompletionDebug}
        onClose={() =>
          appState((draft) => {
            draft.showCompletionDebug = false;
          })
        }
      />
    </div>
  );
}
