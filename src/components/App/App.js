'use client';

import { Icons } from '@/components/Core/Base/Icons';
import { createState } from '@/components/Core/Base/State';
import { useFileSystem } from '@/components/Storage';
import { DEFAULT_CONTENTS, DEFAULT_FILES } from '@/components/Storage/InitialData';
import Settings from '@/components/Storage/Settings';
import { Notification } from '@/components/Widgets/Notification/Notification';
import Resizer from '@/components/Widgets/Resizer/Resizer';
import React, { useEffect, useMemo } from 'react';
import styles from './App.module.css';
import {
  Prompt,
  PromptState,
  Sidebar,
  SidebarState,
  StatusBar,
  TabBar,
  TabState,
  TopBar,
} from './Panes';
import { ShortcutsHelp } from './Popups';
import Dashboard from './Views/Dashboard';
import EditorArea, { EditorState } from './Views/EditorArea';
import LogArea, { LogState } from './Views/LogArea';
import PreviewArea from './Views/PreviewArea';

// App State
import { AppState } from './AppState';
import { PreviewState } from './PreviewState';

import Node from '../Core/Base/Node';
import KeyboardHandler from './Manager/KeyboardHandler';
// Persistence
import ContentSaver from './Persistence/ContentSaver';
import PreviewRestorer from './Persistence/PreviewRestorer';
import ProjectNameSaver from './Persistence/ProjectNameSaver';
import TabRestorer from './Persistence/TabRestorer';

const AppWrapperState = createState('AppWrapperState');

export default function App() {
  const fs = useFileSystem();
  const initialProjectName = useMemo(() => Settings.getProjectName(), []);

  const initialFiles = useMemo(() => DEFAULT_FILES, []);

  const initialContents = useMemo(() => {
    const stored = Settings.getFileContents();
    if (stored && Object.keys(stored).length > 0) return stored;
    return DEFAULT_CONTENTS;
  }, []);

  const initialTheme = Settings.getTheme();

  const initialTabs = useMemo(() => {
    const stored = Settings.getOpenTabs();
    if (stored) return stored;
    return [];
  }, []);

  const initialActiveTabId = useMemo(() => Settings.getActiveTabId() || null, []);
  const initialAILogs = useMemo(() => {
    const stored = Settings.getAILogs();
    return stored || [];
  }, []);

  const initialSidebarWidth = useMemo(() => Settings.getSidebarWidth(), []);
  const initialPromptWidth = useMemo(() => Settings.getPromptWidth(), []);
  const initialIsSidebarOpen = useMemo(() => Settings.getIsSidebarOpen(), []);
  const initialShowAIInput = useMemo(() => Settings.getShowAIInput(), []);
  const initialExpandedFolders = useMemo(() => Settings.getExpandedFolders(), []);

  if (!fs.isReady) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <div className={styles.logoWrapper}>
            <Icons.ZLogo size={64} className={styles.loadingLogo} />
            <div className={styles.logoGlow} />
          </div>
          <div className={styles.loadingText}>
            <h2>Zakamurai</h2>
            <div className={styles.progressTrack}>
              <div className={styles.progressBar} />
            </div>
            <p>Initializing workspace...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <AppState theme={initialTheme} projectName={initialProjectName} fs={fs} showShortcuts={false}>
        <SidebarState
          isSidebarOpen={initialIsSidebarOpen}
          showAIInput={initialShowAIInput}
          folderTree={initialFiles}
          sidebarWidth={initialSidebarWidth}
          expandedFolders={initialExpandedFolders}
        >
          <TabState openTabs={initialTabs} activeTabId={initialActiveTabId}>
            <LogState isSystemProcessing={false} isAIProcessing={false} logs={initialAILogs}>
              <EditorState fileContents={initialContents}>
                <PromptState promptWidth={initialPromptWidth}>
                  <PreviewState htmlContent={Settings.getPreviewHtml()} isCompilerReady={false}>
                    <ProjectNameSaver />
                    <Notification />
                    <TabRestorer />
                    <PreviewRestorer />
                    <ContentSaver />
                    <KeyboardHandler />
                    <PassiveWrapper />
                  </PreviewState>
                </PromptState>
              </EditorState>
            </LogState>
          </TabState>
        </SidebarState>
      </AppState>
    </div>
  );
}

function PassiveWrapper() {
  const appState = AppState.useState();
  const { theme, showShortcuts } = appState;
  const { openTabs = [], activeTabId } = TabState.useState();
  const { htmlContent, isCompilerReady } = PreviewState.useState();
  const activeTab = openTabs.find((t) => t.id === activeTabId);

  const sidebarState = SidebarState.useState();
  const promptState = PromptState.useState();
  const appWrapperState = AppWrapperState.useState(null, { isResizing: false });
  const { isSidebarOpen, sidebarWidth, showAIInput, expandedFolders } = sidebarState;
  const { promptWidth } = promptState;
  const { isResizing = false } = appWrapperState || {};

  const [isMobile, setIsMobile] = React.useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', checkMobile);
    checkMobile();
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync theme with document.body for global Portals
  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light');
    } else {
      document.body.classList.remove('light');
    }
  }, [theme]);

  // Save theme to localStorage on change
  useEffect(() => {
    Settings.setTheme(theme);
  }, [theme]);

  // Save widths to localStorage on change
  useEffect(() => {
    Settings.setSidebarWidth(sidebarWidth);
  }, [sidebarWidth]);

  useEffect(() => {
    Settings.setPromptWidth(promptWidth);
  }, [promptWidth]);

  useEffect(() => {
    Settings.setIsSidebarOpen(isSidebarOpen);
  }, [isSidebarOpen]);

  useEffect(() => {
    Settings.setShowAIInput(showAIInput);
  }, [showAIInput]);

  useEffect(() => {
    Settings.setExpandedFolders(expandedFolders);
  }, [expandedFolders]);

  // Close sidebars when transitioning to mobile view
  useEffect(() => {
    if (isMobile) {
      if (isSidebarOpen || showAIInput) {
        sidebarState((draft) => {
          draft.isSidebarOpen = false;
          draft.showAIInput = false;
        });
      }
    }
  }, [isMobile, sidebarState]); // Removed isSidebarOpen/showAIInput from deps to only trigger on transition

  const handleSidebarResize = (clientX) => {
    if (isSidebarOpen) {
      sidebarState((draft) => {
        draft.sidebarWidth = Math.max(160, Math.min(clientX, 600));
      });
    }
  };

  const handlePromptResize = (clientX) => {
    if (showAIInput) {
      promptState((draft) => {
        const newWidth = window.innerWidth - clientX;
        draft.promptWidth = Math.max(260, Math.min(newWidth, 600));
      });
    }
  };

  const handleResizeStart = () => {
    appWrapperState((draft) => {
      draft.isResizing = true;
    });
  };

  const handleResizeEnd = () => {
    appWrapperState((draft) => {
      draft.isResizing = false;
    });
  };

  const handleSidebarReset = () => {
    sidebarState((draft) => {
      draft.sidebarWidth = 260;
    });
  };

  const handlePromptReset = () => {
    promptState((draft) => {
      draft.promptWidth = 340;
    });
  };

  const closeOverlays = () => {
    if (window.innerWidth <= 768) {
      if (isSidebarOpen) {
        sidebarState((draft) => {
          draft.isSidebarOpen = false;
        });
      }
      if (showAIInput) {
        sidebarState((draft) => {
          draft.showAIInput = false;
        });
      }
    }
  };

  const handleOverlayKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      closeOverlays();
    }
  };

  return (
    <div
      className={`${styles.appWrapper} ${theme === 'light' ? styles.light : ''} ${isResizing ? styles.isResizing : ''}`}
    >
      {(isSidebarOpen || showAIInput) && (
        <div
          className={styles.mobileOverlay}
          onClick={closeOverlays}
          onKeyDown={handleOverlayKeyDown}
          role="button"
          tabIndex={0}
          aria-label="Close overlays"
        />
      )}
      <Sidebar isMobile={isMobile} />
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
        <div className={styles.workspaceContent}>
          <div className={styles.workspaceMain}>
            <TabBar />
            <div className={styles.editorContainer}>
              {activeTab?.type === 'file' && <EditorArea file={activeTab.file} />}
              {activeTab?.type === 'logs' && <LogArea />}
              {activeTab?.type === 'preview' && (
                <PreviewArea htmlContent={htmlContent} isCompilerReady={isCompilerReady} />
              )}
              {!activeTab && <Dashboard />}
            </div>
          </div>
          {showAIInput && !isMobile && (
            <Node>
              <Resizer
                onResize={handlePromptResize}
                onResizeStart={handleResizeStart}
                onResizeEnd={handleResizeEnd}
                onDoubleClick={handlePromptReset}
              />
            </Node>
          )}
          <Prompt isMobile={isMobile} />
        </div>
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
    </div>
  );
}
