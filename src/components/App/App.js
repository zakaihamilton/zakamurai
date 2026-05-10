'use client';

import { useFileSystem } from '@/components/Storage';
import { DEFAULT_CONTENTS, DEFAULT_FILES } from '@/components/Storage/InitialData';
import Settings from '@/components/Storage/Settings';
import { Notification, NotificationProvider } from '@/components/Widgets/Notification/Notification';
import Resizer from '@/components/Widgets/Resizer/Resizer';
import React, { useState, useMemo, useEffect } from 'react';
import styles from './App.module.css';
import Prompt, { PromptState } from './Prompt';
import ShortcutsHelp from './ShortcutsHelp/ShortcutsHelp';
import Sidebar, { SidebarState } from './Sidebar';
import StatusBar from './StatusBar/StatusBar';
import TabBar, { TabState } from './TabBar';
import TopBar from './TopBar';
import Dashboard from './Views/Dashboard';
import EditorArea, { EditorState } from './Views/EditorArea';
import LogArea, { LogState } from './Views/LogArea';
import PreviewArea from './Views/PreviewArea';

// App State
import { AppState } from './AppState';
import { PreviewState } from './PreviewState';

import ContentSaver from './subcomponents/ContentSaver';
import KeyboardHandler from './subcomponents/KeyboardHandler';
// Subcomponents
import PreviewRestorer from './subcomponents/PreviewRestorer';
import ProjectNameSaver from './subcomponents/ProjectNameSaver';
import TabRestorer from './subcomponents/TabRestorer';

export default function App() {
  const fs = useFileSystem();
  const [initialProjectName] = useState(() => Settings.getProjectName());

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

  return (
    <div className={styles.root}>
      <AppState
        theme={initialTheme}
        projectName={initialProjectName}
        fs={fs}
        showShortcuts={false}
      />
      <ProjectNameSaver />
      <Notification />
      <SidebarState
        isSidebarOpen={initialIsSidebarOpen}
        showAIInput={initialShowAIInput}
        folderTree={initialFiles}
        sidebarWidth={initialSidebarWidth}
        expandedFolders={initialExpandedFolders}
      />
      <TabState openTabs={initialTabs} activeTabId={initialActiveTabId} />
      <LogState isProcessing={false} logs={initialAILogs} />
      <EditorState fileContents={initialContents} />
      <PromptState promptWidth={initialPromptWidth} />
      <PreviewState htmlContent={Settings.getPreviewHtml()} isCompilerReady={false} />

      <TabRestorer />
      <PreviewRestorer />
      <ContentSaver />
      <KeyboardHandler />
      <PassiveWrapper />
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
  const { isSidebarOpen, sidebarWidth, showAIInput, expandedFolders } = sidebarState;
  const { promptWidth } = promptState;
  const [isResizing, setIsResizing] = useState(false);

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

  const handleResizeStart = () => setIsResizing(true);
  const handleResizeEnd = () => setIsResizing(false);

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

  return (
    <div
      className={`${styles.appWrapper} ${theme === 'light' ? styles.light : ''} ${isResizing ? styles.isResizing : ''}`}
    >
      <Sidebar />
      {isSidebarOpen && (
        <Resizer
          onResize={handleSidebarResize}
          onResizeStart={handleResizeStart}
          onResizeEnd={handleResizeEnd}
          onDoubleClick={handleSidebarReset}
        />
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
          {showAIInput && (
            <Resizer
              onResize={handlePromptResize}
              onResizeStart={handleResizeStart}
              onResizeEnd={handleResizeEnd}
              onDoubleClick={handlePromptReset}
            />
          )}
          <Prompt />
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
