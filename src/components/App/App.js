'use client';

import { computeDiff } from '@/components/AI/Processor/utils/DiffEngine';
import { RagState } from '@/components/AI/RagState';
import { WebLLMState, bindWebLLMStore } from '@/components/AI/WebLLMState';
import { useFileSystem } from '@/components/Storage';
import {
  DEFAULT_CONTENTS,
  DEFAULT_FILES,
  SCRATCH_CONTENTS,
  SCRATCH_FILES,
} from '@/components/Storage/InitialData';
import Settings from '@/components/Storage/Settings';
import React, { useEffect, useMemo, useRef } from 'react';
import styles from './App.module.css';
import { PromptState, PromptUiState, SidebarState, TabState } from './Panes';
import { AgentSessionState, normalizeAgentSessions } from './Panes/Prompt/AgentSessions';
import { getInitialPromptUiState } from './Panes/Prompt/PromptState';
import { PreviewState } from './PreviewState';
import { EditorState } from './Views/EditorArea';
import { LogState } from './Views/LogArea';

import { NotificationState } from '@/components/ui/Notification/Notification';
import { MOBILE_BREAKPOINT } from '@/constants/Layout';
import { AppState } from './AppState';

import AppBackgroundServices from './Layout/AppBackgroundServices';
import AppContent from './Layout/AppContent';
import AppLoading from './Layout/AppLoading';

import { useSettingsSync } from '@/components/Storage/SettingsSync';
import { useWindowResize } from './WindowResize';

export default function App() {
  const fs = useFileSystem();
  const syncedRootHandleRef = useRef(null);

  // Memoized initial values from Settings
  const initialValues = useMemo(() => {
    const template = Settings.getTemplate();
    const isScratch = template === 'scratch';
    const defaultFiles = isScratch ? SCRATCH_FILES : DEFAULT_FILES;
    const defaultContents = isScratch ? SCRATCH_CONTENTS : DEFAULT_CONTENTS;
    const storedContents = Settings.getFileContents();
    const pendingDiffs = Object.fromEntries(
      Object.entries(Settings.getPendingDiffs()).map(([path, diff]) => [
        path,
        {
          ...diff,
          diffs: computeDiff(diff.originalContent, diff.modifiedContent).diffs,
        },
      ]),
    );
    const restoredContents = {
      ...(storedContents && Object.keys(storedContents).length > 0
        ? storedContents
        : defaultContents),
      ...Object.fromEntries(
        Object.entries(pendingDiffs).map(([path, diff]) => [path, diff.modifiedContent]),
      ),
    };

    return {
      projectName: Settings.getProjectName(),
      files: defaultFiles,
      contents: restoredContents,
      theme: Settings.getTheme(),
      tabs: Settings.getOpenTabs() || [],
      activeTabId: Settings.getActiveTabId() || null,
      lastCodeTabId: Settings.getLastCodeTabId() || null,
      aiLogs: Settings.getAILogs() || [],
      sidebarWidth: Settings.getSidebarWidth(),
      promptWidth: Settings.getPromptWidth(),
      isSidebarOpen: Settings.getIsSidebarOpen(),
      showAIInput: Settings.getShowAIInput(),
      expandedFolders: Settings.getExpandedFolders(),
      aiCompletionEnabled: Settings.getAICompletionEnabled(),
      isReadOnly: Settings.getEditorReadOnly(false),
      promptHistory: Settings.getPromptHistory() || [],
      previewHtml: Settings.getPreviewHtml(),
      pendingDiffs,
      agentSessions: (() => {
        const stored = Settings.getAgentSessions();
        const activeId = Settings.getActiveAgentSessionId();
        return normalizeAgentSessions(
          stored ? { ...stored, activeSessionId: activeId || stored.activeSessionId } : null,
        );
      })(),
    };
  }, []);

  // Initialize all states
  const appState = AppState.useState(null, {
    theme: initialValues.theme,
    projectName: initialValues.projectName,
    showShortcuts: false,
    isResizing: false,
    isMobile: typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT : false,
    compileRequest: 0,
    silentCompileRequest: 0,
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

  const tabState = TabState.useState(null, {
    openTabs: initialValues.tabs,
    activeTabId: initialValues.activeTabId,
    lastCodeTabId: initialValues.lastCodeTabId,
  });

  const logState = LogState.useState(null, {
    isSystemProcessing: false,
    isAIProcessing: false,
    logs: initialValues.aiLogs,
  });

  const editorState = EditorState.useState(null, {
    fileContents: initialValues.contents,
    aiCompletionEnabled: initialValues.aiCompletionEnabled,
    isReadOnly: initialValues.isReadOnly,
    navigationHistory: {
      stack: [],
      currentIndex: -1,
    },
    pendingDiffs: initialValues.pendingDiffs,
    pendingDeletions: {},
  });

  const promptState = PromptState.useState(null, {
    promptWidth: initialValues.promptWidth,
    promptHistory: initialValues.promptHistory,
  });

  const promptUiState = PromptUiState.useState(null, getInitialPromptUiState());

  const agentSessionState = AgentSessionState.useState(null, {
    sessions: initialValues.agentSessions.sessions,
    activeSessionId: initialValues.agentSessions.activeSessionId,
  });

  const previewState = PreviewState.useState(null, {
    htmlContent: initialValues.previewHtml,
    isCompilerReady: false,
    previewAddress: '/preview/dist/index.html',
    containerStatus: 'idle',
    compileStatus: 'idle',
    compilePhase: null,
    lastCompileAt: null,
    containerError: null,
  });

  NotificationState.useState(null, { notifications: [] });

  const webLLMState = WebLLMState.useState(null, {
    cachedModelIds: [],
    engines: {},
    activeModelId: null,
  });

  useEffect(() => {
    bindWebLLMStore(webLLMState);
    return () => bindWebLLMStore(null);
  }, [webLLMState]);

  RagState.useState(null, {
    status: 'idle',
    error: null,
    indexedFileCount: 0,
    lastIndexedAt: null,
    lastFingerprint: null,
  });

  // Background Services & Sync
  useWindowResize(appState, sidebarState);
  useSettingsSync(
    appState,
    sidebarState,
    promptState,
    editorState,
    agentSessionState,
    tabState,
    logState,
    previewState,
    promptUiState,
  );

  // Sync project name from mounted FS root
  useEffect(() => {
    if (
      fs.rootHandle?.name &&
      syncedRootHandleRef.current !== fs.rootHandle &&
      appState.projectName !== fs.rootHandle.name
    ) {
      appState((draft) => {
        draft.projectName = fs.rootHandle.name;
      });
    }
    syncedRootHandleRef.current = fs.rootHandle || null;
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
