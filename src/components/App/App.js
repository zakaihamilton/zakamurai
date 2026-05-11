'use client';

import { useFileSystem } from '@/components/Storage';
import { DEFAULT_CONTENTS, DEFAULT_FILES } from '@/components/Storage/InitialData';
import Settings from '@/components/Storage/Settings';
import React, { useEffect, useMemo } from 'react';
import styles from './App.module.css';
import { PromptState, SidebarState, TabState } from './Panes';
import { PreviewState } from './PreviewState';
import { EditorState } from './Views/EditorArea';
import { LogState } from './Views/LogArea';

// App State
import { AppState } from './AppState';

import AppBackgroundServices from './App/AppBackgroundServices';
import AppContent from './App/AppContent';
// Sub Components
import AppLoading from './App/AppLoading';

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

  // Initialize all states
  const appState = AppState.useState(null, {
    theme: initialTheme,
    projectName: initialProjectName,
    fs,
    showShortcuts: false,
    isResizing: false,
    isMobile: typeof window !== 'undefined' ? window.innerWidth <= 768 : false,
  });
  const sidebarState = SidebarState.useState(null, {
    isSidebarOpen: initialIsSidebarOpen,
    showAIInput: initialShowAIInput,
    isSidebarPopupOpen: false,
    isAIInputPopupOpen: false,
    folderTree: initialFiles,
    sidebarWidth: initialSidebarWidth,
    expandedFolders: initialExpandedFolders,
  });
  const _tabState = TabState.useState(null, {
    openTabs: initialTabs,
    activeTabId: initialActiveTabId,
  });
  LogState.useState(null, {
    isSystemProcessing: false,
    isAIProcessing: false,
    logs: initialAILogs,
  });
  EditorState.useState(null, {
    fileContents: initialContents,
  });
  const promptState = PromptState.useState(null, {
    promptWidth: initialPromptWidth,
  });
  PreviewState.useState(null, {
    htmlContent: Settings.getPreviewHtml(),
    isCompilerReady: false,
  });

  // Sync fs when it changes
  useEffect(() => {
    appState((draft) => {
      draft.fs = fs;
    });
  }, [fs, appState]);

  const { theme, isMobile } = appState;
  const {
    isSidebarOpen,
    sidebarWidth,
    showAIInput,
    isSidebarPopupOpen,
    isAIInputPopupOpen,
    expandedFolders,
  } = sidebarState;
  const { promptWidth } = promptState;

  useEffect(() => {
    const checkMobile = () => {
      const isMobileNow = window.innerWidth <= 768;
      appState((draft) => {
        draft.isMobile = isMobileNow;
      });
    };
    window.addEventListener('resize', checkMobile);
    checkMobile();
    return () => window.removeEventListener('resize', checkMobile);
  }, [appState]);

  // Sync theme with document.body for global Portals
  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light');
    } else {
      document.body.classList.remove('light');
    }
  }, [theme]);

  // Save state to localStorage on change
  useEffect(() => {
    Settings.setTheme(theme);
  }, [theme]);

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

  const prevIsMobile = React.useRef(isMobile);

  // Close popup sidebars when transitioning to desktop view
  useEffect(() => {
    if (!isMobile && prevIsMobile.current) {
      if (isSidebarPopupOpen || isAIInputPopupOpen) {
        sidebarState((draft) => {
          draft.isSidebarPopupOpen = false;
          draft.isAIInputPopupOpen = false;
        });
      }
    }
    prevIsMobile.current = isMobile;
  }, [isMobile, sidebarState, isSidebarPopupOpen, isAIInputPopupOpen]);

  if (!fs.isReady) {
    return <AppLoading />;
  }

  return (
    <div className={styles.root}>
      <AppBackgroundServices />
      <AppContent />
    </div>
  );
}
