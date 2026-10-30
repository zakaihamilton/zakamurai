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
import { AgentSessionState, createDefaultAgentSessions } from './Panes/Prompt/AgentSessions';
import { getInitialPromptUiState } from './Panes/Prompt/PromptState';
import { PreviewState } from './PreviewState';
import { EditorState } from './Views/EditorArea';
import type { ExtendedEditorState } from './Views/EditorArea/types';
import { LogState } from './Views/LogArea';
import { useWindowResize } from './WindowResize';
import type { InitialAppValues } from './types';
import { requireStore } from './types';

export default function useAppStores(initialValues: InitialAppValues, fs: FileSystemApi) {
  const syncedRootHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const hasObservedReadyFilesystemRef = useRef(false);
  const rootSwitchGenerationRef = useRef(0);

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
      workspaceEpoch: 0,
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
      dirtyBufferContents: {},
      aiCompletionEnabled: initialValues.aiCompletionEnabled,
      isReadOnly: initialValues.isReadOnly,
      navigationHistory: { stack: [], currentIndex: -1 },
      pendingDiffs: initialValues.pendingDiffs,
      pendingDeletions: initialValues.pendingDeletions as ExtendedEditorState['pendingDeletions'],
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
    capabilityReport: null,
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
  const workspaceHealthState = WorkspaceHealthState.useState(null, DEFAULT_WORKSPACE_HEALTH);
  const problemsState = ProblemsState.useState(null, { items: [] });
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
    fs.mode === 'local',
  );

  useEffect(() => {
    if (!fs.isReady) return;
    if (!hasObservedReadyFilesystemRef.current) {
      hasObservedReadyFilesystemRef.current = true;
      syncedRootHandleRef.current = fs.rootHandle;
      return;
    }

    const previousRootHandle = syncedRootHandleRef.current;
    if (previousRootHandle === fs.rootHandle) return;
    const nextRootHandle = fs.rootHandle ?? null;
    syncedRootHandleRef.current = nextRootHandle;
    // Fence late work before the asynchronous same-entry check completes.
    appState((draft) => {
      draft.workspaceEpoch = (draft.workspaceEpoch || 0) + 1;
    });
    promptUiState?.abortController?.abort();
    promptUiState?.((draft) => {
      draft.runningSessionId = null;
      draft.abortController = null;
    });
    logState((draft) => {
      draft.isAIProcessing = false;
    });
    agentSessionState?.((draft) => {
      for (const session of Object.values(draft.sessions || {})) {
        if (session.status === 'running') {
          session.status = 'idle';
          session.activity = undefined;
        }
      }
    });
    sidebarState((draft) => {
      draft.draggedItem = null;
    });
    if (!nextRootHandle) return;
    const generation = ++rootSwitchGenerationRef.current;
    const resetForNewRoot = () => {
      if (generation !== rootSwitchGenerationRef.current || fs.rootHandle !== nextRootHandle) {
        return;
      }

      // Relinking changes the workspace boundary; discard state tied to the old root.
      appState((draft) => {
        draft.projectName = nextRootHandle.name || draft.projectName;
      });
      sidebarState((draft) => {
        draft.folderTree = [];
        draft.expandedFolders = {};
        draft.draggedItem = null;
      });
      tabState((draft) => {
        draft.openTabs = [];
        draft.activeTabId = null;
        draft.lastCodeTabId = null;
      });
      editorState((draft) => {
        draft.fileContents = {};
        draft.dirtyBufferContents = {};
        draft.pendingDiffs = {};
        draft.pendingDeletions = {};
        draft.navigationHistory = { stack: [], currentIndex: -1 };
        draft.shouldScrollTo = null;
        draft.history = {};
        draft.cursorPos = {};
        draft.selectedLines = {};
        draft.isCompleting = {};
        draft.completionActivity = {};
        draft.aiCompletionDebug = undefined;
      });
      changeSetState?.((draft) => {
        draft.activeId = null;
        draft.items = [];
      });
      problemsState?.((draft) => {
        draft.items = [];
      });
      workspaceHealthState?.((draft) => {
        Object.assign(draft, DEFAULT_WORKSPACE_HEALTH);
      });
      promptState?.((draft) => {
        draft.promptHistory = [];
      });
      agentSessionState?.((draft) => {
        const next = createDefaultAgentSessions(promptUiState?.selectedModel || null);
        draft.sessions = next.sessions;
        draft.activeSessionId = next.activeSessionId;
      });
      logState((draft) => {
        draft.isSystemProcessing = false;
        draft.isAIProcessing = false;
        draft.logs = [];
        draft.reasoning = '';
      });
      promptUiState?.((draft) => {
        draft.val = '';
        draft.draftVal = '';
        draft.historyIndex = -1;
        draft.welcomeRequest = null;
        draft.runningSessionId = null;
        draft.abortController = null;
        draft.sessionDialog = null;
        draft.isAgentTreeOpen = false;
        draft.latestManagerTrace = null;
        draft.latestAIIncident = null;
      });
      previewState((draft) => {
        draft.htmlContent = null;
        draft.isCompilerReady = false;
        draft.previewSessionId = null;
        draft.containerStatus = 'idle';
        draft.compileStatus = 'idle';
        draft.compilePhase = null;
        draft.lastCompileAt = null;
        draft.containerError = null;
        draft.restoreError = null;
        draft.compileError = null;
        draft.compileDiagnostic = undefined;
        draft.serverError = null;
      });
    };

    if (previousRootHandle && nextRootHandle && previousRootHandle.isSameEntry) {
      void previousRootHandle
        .isSameEntry(nextRootHandle)
        .then((isSameRoot) => {
          if (
            isSameRoot &&
            generation === rootSwitchGenerationRef.current &&
            fs.rootHandle === nextRootHandle
          ) {
            syncedRootHandleRef.current = nextRootHandle;
            return;
          }
          resetForNewRoot();
        })
        .catch(resetForNewRoot);
    } else {
      resetForNewRoot();
    }
  }, [
    fs.isReady,
    fs.rootHandle,
    appState,
    sidebarState,
    tabState,
    editorState,
    changeSetState,
    problemsState,
    workspaceHealthState,
    promptState,
    agentSessionState,
    logState,
    promptUiState,
    previewState,
  ]);

  useEffect(() => {
    const rootName = fs.rootHandle?.name;
    if (rootName && appState.projectName !== rootName) {
      appState((draft) => {
        draft.projectName = rootName;
      });
    }
  }, [appState, fs]);

  useEffect(() => {
    document.body.classList.toggle('light', appState.theme === 'light');
  }, [appState.theme]);
}
