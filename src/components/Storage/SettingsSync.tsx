import { serializeAgentSessions } from '@/components/App/Panes/Prompt/AgentSessions';
import Settings from '@/components/Storage/Settings';
import type {
  AgentSessionStateShape,
  AppStateShape,
  ChangeSetStateShape,
  EditorStateShape,
  LogStateShape,
  PendingDiff,
  PreviewStateShape,
  PromptStateShape,
  PromptUiStateShape,
  SidebarStateShape,
  TabStateShape,
  WorkspaceProfileStateShape,
} from '@/components/state/domain-types';
import type { StateStore } from '@/components/state/types';
import { useEffect } from 'react';
import useStoragePersistenceStatus from './useStoragePersistenceStatus';

export function useSettingsSync(
  appState: Pick<AppStateShape, 'theme' | 'projectName'>,
  sidebarState: Pick<
    SidebarStateShape,
    'sidebarWidth' | 'isSidebarOpen' | 'showAIInput' | 'expandedFolders'
  >,
  promptState: Pick<PromptStateShape, 'promptWidth' | 'promptHistory'>,
  editorState: Pick<
    EditorStateShape,
    'aiCompletionEnabled' | 'isReadOnly' | 'fileContents' | 'pendingDiffs'
  >,
  agentSessionState:
    | Pick<AgentSessionStateShape, 'sessions' | 'activeSessionId'>
    | null
    | undefined,
  tabState: Pick<TabStateShape, 'openTabs' | 'activeTabId' | 'lastCodeTabId'> | null | undefined,
  logState: Pick<LogStateShape, 'logs'> | null | undefined,
  previewState: Pick<PreviewStateShape, 'htmlContent'> | null | undefined,
  promptUiState:
    | (Pick<PromptUiStateShape, 'val' | 'selectedModel'> &
        Partial<Pick<PromptUiStateShape, 'welcomePrompt'>>)
    | null
    | undefined,
  workspaceProfileState: StateStore<WorkspaceProfileStateShape> | null = null,
  changeSetState: StateStore<ChangeSetStateShape> | null = null,
) {
  const persist = useStoragePersistenceStatus();

  const { theme, projectName } = appState;
  const { sidebarWidth, isSidebarOpen, showAIInput, expandedFolders } = sidebarState;
  const { promptWidth, promptHistory } = promptState;
  const { aiCompletionEnabled, isReadOnly, fileContents, pendingDiffs } = editorState;
  const sessions = agentSessionState?.sessions;
  const activeSessionId = agentSessionState?.activeSessionId;
  const { openTabs, activeTabId, lastCodeTabId } = tabState || {};
  const { logs } = logState || {};
  const { htmlContent } = previewState || {};
  const { val: promptDraft, welcomePrompt, selectedModel } = promptUiState || {};
  const workspaceProfile: WorkspaceProfileStateShape = workspaceProfileState ?? {
    include: [],
    exclude: [],
    maxFileBytes: 512 * 1024,
  };
  const { activeId: changeSetActiveId = null, items: changeSetItems = [] } = changeSetState ?? {
    activeId: null,
    items: [],
  };

  useEffect(() => {
    Settings.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    Settings.setProjectName(projectName);
  }, [projectName]);

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

  useEffect(() => {
    Settings.setAICompletionEnabled(aiCompletionEnabled === true);
  }, [aiCompletionEnabled]);

  useEffect(() => {
    if (typeof isReadOnly === 'boolean') {
      Settings.setEditorReadOnly(isReadOnly);
    }
  }, [isReadOnly]);

  useEffect(() => {
    if (selectedModel) {
      Settings.setAIPromptModel(selectedModel);
    }
  }, [selectedModel]);

  useEffect(() => {
    if (typeof promptDraft !== 'string') return undefined;
    const timer = setTimeout(() => {
      Settings.setPromptDraft(promptDraft || '');
    }, 250);
    return () => clearTimeout(timer);
  }, [promptDraft]);

  useEffect(() => {
    if (typeof welcomePrompt !== 'string') return undefined;
    const timer = setTimeout(() => {
      Settings.setWelcomePromptDraft(welcomePrompt || '');
    }, 250);
    return () => clearTimeout(timer);
  }, [welcomePrompt]);

  useEffect(() => {
    if (!Array.isArray(promptHistory)) return undefined;
    const timer = setTimeout(() => {
      persist(Settings.setPromptHistory(promptHistory));
    }, 400);
    return () => clearTimeout(timer);
  }, [persist, promptHistory]);

  useEffect(() => {
    if (!Array.isArray(openTabs)) return undefined;
    const timer = setTimeout(() => {
      persist(Settings.setOpenTabs(openTabs));
    }, 400);
    return () => clearTimeout(timer);
  }, [openTabs, persist]);

  useEffect(() => {
    Settings.setActiveTabId(activeTabId || null);
  }, [activeTabId]);

  useEffect(() => {
    Settings.setLastCodeTabId(lastCodeTabId || null);
  }, [lastCodeTabId]);

  useEffect(() => {
    if (!Array.isArray(logs)) return undefined;
    const timer = setTimeout(() => {
      void Promise.resolve(Settings.setAILogs(logs)).then((ok) => persist(ok));
    }, 500);
    return () => clearTimeout(timer);
  }, [logs, persist]);

  useEffect(() => {
    if (htmlContent === undefined) return undefined;
    const timer = setTimeout(() => {
      void Promise.resolve(Settings.setPreviewHtml(htmlContent || null)).then((ok) => persist(ok));
    }, 500);
    return () => clearTimeout(timer);
  }, [htmlContent, persist]);

  useEffect(() => {
    if (!fileContents || typeof fileContents !== 'object') return undefined;
    const timer = setTimeout(() => {
      void Promise.resolve(Settings.setFileContents({ ...fileContents })).then((ok) => persist(ok));
    }, 1000);
    return () => clearTimeout(timer);
  }, [fileContents, persist]);

  useEffect(() => {
    if (!pendingDiffs || typeof pendingDiffs !== 'object') return undefined;
    const timer = setTimeout(() => {
      const diffsToSave: Record<string, PendingDiff> = {};
      for (const [path, diff] of Object.entries(pendingDiffs)) {
        if (typeof diff?.originalContent !== 'string' || !Array.isArray(diff?.diffs)) continue;
        diffsToSave[path] = {
          ...diff,
          modifiedContent: fileContents?.[path] ?? diff.modifiedContent ?? '',
        };
      }
      void Promise.resolve(Settings.setPendingDiffs(diffsToSave)).then((ok) => persist(ok));
    }, 1000);
    return () => clearTimeout(timer);
  }, [fileContents, pendingDiffs, persist]);

  useEffect(() => {
    if (!fileContents || typeof fileContents !== 'object') return undefined;
    const timer = setTimeout(() => {
      void Settings.saveRecoveryCheckpoint({
        projectName,
        fileContents: { ...fileContents },
        pendingDiffs: pendingDiffs || {},
        openTabs: Array.isArray(openTabs) ? openTabs : [],
        activeTabId: activeTabId || null,
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [activeTabId, fileContents, openTabs, pendingDiffs, projectName]);

  useEffect(() => {
    if (!sessions || !activeSessionId) return undefined;
    const isRunning = Object.values(sessions).some((s) => s?.status === 'running');
    const debounceMs = isRunning ? 2000 : 500;
    const timer = setTimeout(() => {
      const payload = serializeAgentSessions({ sessions, activeSessionId });
      void Promise.resolve(Settings.setAgentSessions(payload)).then((ok) => {
        persist(ok);
        if (ok) {
          Settings.setActiveAgentSessionId(payload.activeSessionId);
        }
      });
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [activeSessionId, persist, sessions]);

  useEffect(() => {
    if (!workspaceProfileState || typeof Settings.setWorkspaceProfile !== 'function') return;
    Settings.setWorkspaceProfile({
      include: workspaceProfile.include || [],
      exclude: workspaceProfile.exclude || [],
      maxFileBytes: workspaceProfile.maxFileBytes,
    });
  }, [
    workspaceProfile.exclude,
    workspaceProfile.include,
    workspaceProfile.maxFileBytes,
    workspaceProfileState,
  ]);

  useEffect(() => {
    if (!changeSetState || typeof Settings.setChangeSets !== 'function') return undefined;
    const timer = setTimeout(() => {
      void Promise.resolve(
        Settings.setChangeSets({ activeId: changeSetActiveId, items: changeSetItems }),
      ).then((ok) => persist(ok));
    }, 500);
    return () => clearTimeout(timer);
  }, [changeSetActiveId, changeSetItems, changeSetState, persist]);
}
