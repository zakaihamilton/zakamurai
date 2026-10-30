import { serializeAgentSessions } from '@/components/App/Panes/Prompt/AgentSessions';
import {
  commitDirtyBufferContentsInDraft,
  createEffectiveFileContentsSnapshot,
} from '@/components/App/Views/EditorArea/EditorBuffers';
import Settings from '@/components/Storage/Settings';
import type {
  AgentSessionStateShape,
  AppStateShape,
  ChangeSetStateShape,
  EditorStateShape,
  LogStateShape,
  PreviewStateShape,
  PromptStateShape,
  PromptUiStateShape,
  SidebarStateShape,
  TabStateShape,
  WorkspaceProfileStateShape,
} from '@/types/domain-types';
import { useEffect, useRef } from 'react';
import type { StateStore } from 'triactor';
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
  > &
    Partial<Pick<EditorStateShape, 'pendingDeletions' | 'dirtyBufferContents'>>,
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
  isLocalFileSystem = false,
) {
  const persist = useStoragePersistenceStatus();
  const saveStartedAtRef = useRef<number | null>(null);
  const lastPersistedRef = useRef<{
    fileContents: EditorStateShape['fileContents'] | null;
    dirtyBufferContents: EditorStateShape['dirtyBufferContents'];
    pendingDiffs: EditorStateShape['pendingDiffs'] | null;
    pendingDeletions: EditorStateShape['pendingDeletions'] | undefined;
    openTabs: TabStateShape['openTabs'] | undefined;
    activeTabId: TabStateShape['activeTabId'] | undefined;
    projectName: string;
  } | null>(null);

  const { theme, projectName } = appState;
  const { sidebarWidth, isSidebarOpen, showAIInput, expandedFolders } = sidebarState;
  const { promptWidth, promptHistory } = promptState;
  const {
    aiCompletionEnabled,
    isReadOnly,
    fileContents,
    dirtyBufferContents,
    pendingDiffs,
    pendingDeletions,
  } = editorState;
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
    styleProfile: null,
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
    const lastSaved = lastPersistedRef.current;
    if (
      lastSaved?.fileContents === fileContents &&
      lastSaved.dirtyBufferContents === dirtyBufferContents &&
      lastSaved.pendingDiffs === pendingDiffs &&
      lastSaved.pendingDeletions === pendingDeletions &&
      lastSaved.openTabs === openTabs &&
      lastSaved.activeTabId === activeTabId &&
      lastSaved.projectName === projectName
    ) {
      return undefined;
    }

    const startedAt = saveStartedAtRef.current ?? Date.now();
    saveStartedAtRef.current = startedAt;
    const delay = Math.max(0, Math.min(3000, startedAt + 10000 - Date.now()));
    const timer = setTimeout(async () => {
      saveStartedAtRef.current = null;
      const contentsAtStart = fileContents;
      const dirtyAtStart = { ...(dirtyBufferContents || {}) };
      const dirtyStateAtStart = dirtyBufferContents;
      const diffsAtStart = pendingDiffs || {};
      const deletionsAtStart = pendingDeletions || {};
      const snapshot = createEffectiveFileContentsSnapshot({
        fileContents: contentsAtStart,
        dirtyBufferContents: dirtyAtStart,
      });
      const saved = await Settings.persistEditorBuffersSnapshot({
        fileContents: snapshot,
        pendingDiffs: diffsAtStart,
        pendingDeletions: deletionsAtStart,
        recovery: {
          reason: 'storage-recovery',
          projectName,
          openTabs: Array.isArray(openTabs) ? openTabs : [],
          activeTabId: activeTabId || null,
        },
      });
      persist(saved);
      if (!saved) return;

      let committedContents = contentsAtStart;
      let remainingDirty = dirtyStateAtStart;
      const mutableState = editorState as unknown as StateStore<EditorStateShape>;
      const contentStateUnchangedBeforeCommit = mutableState.fileContents === contentsAtStart;
      const dirtyStateUnchangedBeforeCommit =
        mutableState.dirtyBufferContents === dirtyStateAtStart;
      if (
        !isLocalFileSystem &&
        typeof mutableState === 'function' &&
        Object.keys(dirtyAtStart).length > 0
      ) {
        mutableState((draft) => {
          commitDirtyBufferContentsInDraft(draft, dirtyAtStart);
          committedContents = draft.fileContents;
          remainingDirty = draft.dirtyBufferContents;
        });
      }

      lastPersistedRef.current = {
        fileContents: contentStateUnchangedBeforeCommit ? committedContents : contentsAtStart,
        dirtyBufferContents: dirtyStateUnchangedBeforeCommit ? remainingDirty : dirtyStateAtStart,
        pendingDiffs,
        pendingDeletions,
        openTabs,
        activeTabId,
        projectName,
      };
    }, delay);
    return () => clearTimeout(timer);
  }, [
    activeTabId,
    dirtyBufferContents,
    editorState,
    fileContents,
    openTabs,
    pendingDeletions,
    pendingDiffs,
    persist,
    projectName,
    isLocalFileSystem,
  ]);

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
      styleProfile: workspaceProfile.styleProfile || null,
    });
  }, [
    workspaceProfile.exclude,
    workspaceProfile.include,
    workspaceProfile.maxFileBytes,
    workspaceProfile.styleProfile,
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
