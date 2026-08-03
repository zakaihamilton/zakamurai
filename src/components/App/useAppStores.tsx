import { RagState } from '@/components/AI/RagState';
import { WebLLMState, bindWebLLMStore } from '@/components/AI/WebLLMState';
import type { WebLLMStateDraft } from '@/components/AI/types';
import type { FileSystemApi } from '@/components/App/types';
import { DiagnosticsState, bindDiagnosticsState } from '@/components/Diagnostics';
import { markPerformance, measurePerformance } from '@/components/Performance';
import { useSettingsSync } from '@/components/Storage/SettingsSync';
import { StorageHealthState } from '@/components/Storage/StorageHealth';
import {
  ChangeSetState,
  DEFAULT_WORKSPACE_HEALTH,
  DEFAULT_WORKSPACE_PROFILE,
  ProblemsState,
  WorkspaceHealthState,
  WorkspaceProfileState,
} from '@/components/Workspace';
import { NotificationState } from '@/components/ui/Notification/Notification';
import { MOBILE_BREAKPOINT } from '@/constants/Layout';
import { useEffect, useRef } from 'react';
import { AppState } from './AppState';
import { PromptState, PromptUiState, SidebarState, TabState } from './Panes';
import { AgentSessionState } from './Panes/Prompt/AgentSessions';
import { getInitialPromptUiState } from './Panes/Prompt/PromptState';
import { PreviewState } from './PreviewState';
import { EditorState } from './Views/EditorArea';
import { LogState } from './Views/LogArea';
import { useWindowResize } from './WindowResize';
import type { InitialAppValues } from './types';
import { requireStore } from './types';

export default function useAppStores(initialValues: InitialAppValues, fs: FileSystemApi) {
  const syncedRootHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  const appState = requireStore(
    AppState.useState(null, {
      theme: initialValues.theme,
      projectName: initialValues.projectName,
      showShortcuts: false,
      showCompletionDebug: false,
      isResizing: false,
      isMobile: typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT : false,
      compileRequest: 0,
      silentCompileRequest: 0,
    }),
  );
  const sidebarState = requireStore(
    SidebarState.useState(null, {
      isSidebarOpen: initialValues.isSidebarOpen,
      showAIInput: initialValues.showAIInput,
      isSidebarPopupOpen: false,
      isAIInputPopupOpen: false,
      folderTree: initialValues.files,
      sidebarWidth: initialValues.sidebarWidth,
      expandedFolders: initialValues.expandedFolders,
    }),
  );
  const tabState = requireStore(
    TabState.useState(null, {
      openTabs: initialValues.tabs,
      activeTabId: initialValues.activeTabId,
      lastCodeTabId: initialValues.lastCodeTabId,
    }),
  );
  const logState = requireStore(
    LogState.useState(null, {
      isSystemProcessing: false,
      isAIProcessing: false,
      logs: initialValues.aiLogs,
    }),
  );
  const editorState = requireStore(
    EditorState.useState(null, {
      fileContents: initialValues.contents,
      aiCompletionEnabled: initialValues.aiCompletionEnabled,
      isReadOnly: initialValues.isReadOnly,
      navigationHistory: { stack: [], currentIndex: -1 },
      pendingDiffs: initialValues.pendingDiffs,
      pendingDeletions: {},
    }),
  );
  const promptState = requireStore(
    PromptState.useState(null, {
      promptWidth: initialValues.promptWidth,
      promptHistory: initialValues.promptHistory,
    }),
  );
  const promptUiState = requireStore(PromptUiState.useState(null, getInitialPromptUiState()));
  const agentSessionState = requireStore(
    AgentSessionState.useState(null, {
      sessions: initialValues.agentSessions.sessions,
      activeSessionId: initialValues.agentSessions.activeSessionId,
    }),
  );
  const previewState = requireStore(
    PreviewState.useState(null, {
      htmlContent: initialValues.previewHtml,
      isCompilerReady: false,
      previewAddress: '/preview/dist/index.html',
      previewSessionId: null,
      containerStatus: 'idle',
      compileStatus: 'idle',
      compilePhase: null,
      lastCompileAt: null,
      containerError: null,
    }),
  );

  NotificationState.useState(null, { notifications: [] });
  StorageHealthState.useState(null, { status: 'healthy', layer: null, message: null });
  const diagnosticsState = DiagnosticsState.useState(null, { events: [] });
  useEffect(() => {
    bindDiagnosticsState(diagnosticsState ?? null);
    return () => bindDiagnosticsState(null);
  }, [diagnosticsState]);
  useEffect(() => {
    markPerformance('app-ready');
    measurePerformance('app-hydration', 'app-hydration-start', 'app-ready');
  }, []);

  const webLLMState = WebLLMState.useState(null, {
    cachedModelIds: [],
    engines: {},
    activeModelId: null,
  });
  useEffect(() => {
    bindWebLLMStore(
      (webLLMState ?? null) as import('@/components/AI/types').StateHandle<WebLLMStateDraft> | null,
    );
    return () => bindWebLLMStore(null);
  }, [webLLMState]);

  RagState.useState(null, {
    status: 'idle',
    error: null,
    indexedFileCount: 0,
    lastIndexedAt: null,
    lastFingerprint: null,
  });
  const workspaceProfileState = WorkspaceProfileState.useState(null, {
    ...DEFAULT_WORKSPACE_PROFILE,
    ...initialValues.workspaceProfile,
  });
  WorkspaceHealthState.useState(null, DEFAULT_WORKSPACE_HEALTH);
  ProblemsState.useState(null, { items: [] });
  const changeSetState = ChangeSetState.useState(
    null,
    initialValues.changeSets || { activeId: null, items: [] },
  );

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
    workspaceProfileState ?? null,
    changeSetState ?? null,
  );

  useEffect(() => {
    const rootName = fs.rootHandle?.name;
    if (
      rootName &&
      syncedRootHandleRef.current !== fs.rootHandle &&
      appState.projectName !== rootName
    ) {
      appState((draft) => {
        draft.projectName = rootName;
      });
    }
    syncedRootHandleRef.current = fs.rootHandle ?? null;
  }, [appState, fs]);

  useEffect(() => {
    document.body.classList.toggle('light', appState.theme === 'light');
  }, [appState.theme]);
}
