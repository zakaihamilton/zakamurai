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

import { MOBILE_BREAKPOINT } from '@/constants/Layout';
// App State
import { AppState } from './AppState';

import AppBackgroundServices from './App/AppBackgroundServices';
import AppContent from './App/AppContent';
import AppLoading from './App/AppLoading';

// Hooks
import { useSettingsSync } from '@/components/Storage/SettingsSync';
import { useWindowResize } from './WindowResize';

export default function App() {
  const fs = useFileSystem();

  // Memoized initial values from Settings
  const initialValues = useMemo(
    () => ({
      projectName: Settings.getProjectName(),
      files: DEFAULT_FILES,
      contents: (() => {
        const stored = Settings.getFileContents();
        return stored && Object.keys(stored).length > 0 ? stored : DEFAULT_CONTENTS;
      })(),
      theme: Settings.getTheme(),
      tabs: Settings.getOpenTabs() || [],
      activeTabId: Settings.getActiveTabId() || null,
      aiLogs: Settings.getAILogs() || [],
      sidebarWidth: Settings.getSidebarWidth(),
      promptWidth: Settings.getPromptWidth(),
      isSidebarOpen: Settings.getIsSidebarOpen(),
      showAIInput: Settings.getShowAIInput(),
      expandedFolders: Settings.getExpandedFolders(),
      aiCompletionEnabled: Settings.getAICompletionEnabled(),
    }),
    [],
  );

  // Initialize all states
  const appState = AppState.useState(null, {
    theme: initialValues.theme,
    projectName: initialValues.projectName,
    fs,
    showShortcuts: false,
    isResizing: false,
    isMobile: typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT : false,
  });

  const sidebarState = SidebarState.useState(null, {
    isSidebarOpen: initialValues.isSidebarOpen,
    showAIInput: initialValues.showAIInput,
    isSidebarPopupOpen: false,
    isAIInputPopupOpen: false,
    folderTree: initialValues.files,
    sidebarWidth: initialValues.sidebarWidth,
    expandedFolders: initialValues.expandedFolders,
  });

  TabState.useState(null, {
    openTabs: initialValues.tabs,
    activeTabId: initialValues.activeTabId,
  });

  LogState.useState(null, {
    isSystemProcessing: false,
    isAIProcessing: false,
    logs: initialValues.aiLogs,
  });

  const editorState = EditorState.useState(null, {
    fileContents: initialValues.contents,
    aiCompletionEnabled: initialValues.aiCompletionEnabled,
  });

  const promptState = PromptState.useState(null, {
    promptWidth: initialValues.promptWidth,
  });

  PreviewState.useState(null, {
    htmlContent: Settings.getPreviewHtml(),
    isCompilerReady: false,
  });

  // Background Services & Sync
  useWindowResize(appState, sidebarState);
  useSettingsSync(appState, sidebarState, promptState, editorState);

  // Sync fs when it changes
  useEffect(() => {
    appState((draft) => {
      draft.fs = fs;
    });
  }, [fs, appState]);

  // Global side effects
  useEffect(() => {
    document.body.classList.toggle('light', appState.theme === 'light');
  }, [appState.theme]);

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
