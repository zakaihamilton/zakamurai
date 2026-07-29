import Resizer from '@/components/ui/Resizer';
import type React from 'react';
import Node from '../../state/Node';
import { AppState } from '../AppState';
import { Sidebar, SidebarState, StatusBar, TopBar } from '../Panes';
import { CompletionDebug, ShortcutsHelp } from '../Popups';
import { requireStore } from '../types';
import styles from './AppContent.module.css';
import WorkspaceArea from './WorkspaceArea';

export default function AppContent() {
  const appState = requireStore(
    requireStore(
      AppState.useState([
        'theme',
        'showShortcuts',
        'showCompletionDebug',
        'isResizing',
        'isMobile',
      ]),
    ),
  );
  const sidebarState = requireStore(
    requireStore(
      SidebarState.useState([
        'isSidebarOpen',
        'isSidebarPopupOpen',
        'isAIInputPopupOpen',
        'sidebarWidth',
      ]),
    ),
  );
  const { theme, showShortcuts, showCompletionDebug, isResizing = false, isMobile } = appState;
  const { isSidebarOpen, isSidebarPopupOpen, isAIInputPopupOpen, sidebarWidth } = sidebarState;

  const handleSidebarResize = (clientX: number) => {
    if (isSidebarOpen) {
      sidebarState((draft) => {
        draft.sidebarWidth = Math.max(240, Math.min(clientX, 600));
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
      draft.sidebarWidth = 280;
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

  const handleOverlayKeyDown = (e: React.KeyboardEvent) => {
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
      <TopBar />
      <div className={styles.appBody}>
        <Sidebar />
        {!isMobile && (
          <Node id="sidebar-resizer">
            <Resizer
              onResize={handleSidebarResize}
              onResizeStart={handleResizeStart}
              onResizeEnd={handleResizeEnd}
              onDoubleClick={handleSidebarReset}
              value={sidebarWidth}
              min={240}
              max={600}
              label="Resize sidebar"
              className={!isSidebarOpen ? styles.hidden : ''}
              isCollapsed={!isSidebarOpen}
            />
          </Node>
        )}
        <div className={styles.mainContent}>
          <WorkspaceArea />
          <StatusBar />
        </div>
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
