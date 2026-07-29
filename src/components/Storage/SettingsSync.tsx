import { serializeAgentSessions } from '@/components/App/Panes/Prompt/AgentSessions';
import { reportDiagnostic } from '@/components/Diagnostics';
import Settings from '@/components/Storage/Settings';
import {
  StorageHealthState,
  requestRecoveryExport,
  storageFailureMessage,
  storageHealthMessage,
} from '@/components/Storage/StorageHealth';
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
  StorageHealthStateShape,
  TabStateShape,
  WorkspaceProfileStateShape,
} from '@/components/state/domain-types';
import type { Draft, StateStore } from '@/components/state/types';
import { useNotification } from '@/components/ui/Notification';
import { useEffect, useRef } from 'react';

const SAVE_FAIL_MESSAGE =
  'Could not save project data — browser storage is full. Export or free space to avoid data loss.';

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
  promptUiState: Pick<PromptUiStateShape, 'val' | 'selectedModel'> | null | undefined,
  workspaceProfileState: StateStore<WorkspaceProfileStateShape> | null = null,
  changeSetState: StateStore<ChangeSetStateShape> | null = null,
) {
  const { addNotification } = useNotification();
  const storageHealthState = StorageHealthState.usePassiveState();
  const updateStorageHealth = (
    update: Partial<StorageHealthStateShape> | ((draft: Draft<StorageHealthStateShape>) => void),
  ) => {
    if (typeof storageHealthState === 'function') {
      storageHealthState(update as (draft: Draft<StorageHealthStateShape>) => void);
    }
  };
  const addNotificationRef = useRef(addNotification);
  addNotificationRef.current = addNotification;
  const saveFailureNotifiedRef = useRef(false);
  const quotaWarningNotifiedRef = useRef(false);

  const persistRef = useRef<(ok: boolean | undefined) => boolean | undefined>((ok) => {
    if (ok === false) {
      if (saveFailureNotifiedRef.current) return ok;
      saveFailureNotifiedRef.current = true;
      updateStorageHealth((draft) => {
        draft.status = 'write-failed';
        draft.layer = 'fallback';
        draft.message = storageFailureMessage('fallback');
      });
      addNotificationRef.current(SAVE_FAIL_MESSAGE, 'error', 12000, {
        label: 'Export ZIP',
        onClick: requestRecoveryExport,
      });
      reportDiagnostic({ source: 'storage', severity: 'error', message: SAVE_FAIL_MESSAGE });
    } else if (ok === true) {
      saveFailureNotifiedRef.current = false;
      const health = Settings.getStorageHealth?.() || { status: 'healthy', layer: null };
      updateStorageHealth((draft) => {
        draft.status = health.status;
        draft.layer = health.layer;
        draft.usage = health.usage ?? undefined;
        draft.quota = health.quota ?? undefined;
        draft.lastSuccessfulPersistAt = health.lastSuccessfulPersistAt ?? null;
        draft.message =
          storageHealthMessage({
            ...health,
            usage: health.usage ?? undefined,
            quota: health.quota ?? undefined,
          }) ?? null;
      });
      if (health.quotaWarning && !quotaWarningNotifiedRef.current) {
        quotaWarningNotifiedRef.current = true;
        addNotificationRef.current(
          storageHealthMessage({
            ...health,
            usage: health.usage ?? undefined,
            quota: health.quota ?? undefined,
          }) ?? '',
          'warning',
          12000,
          {
            label: 'Export ZIP',
            onClick: requestRecoveryExport,
          },
        );
      } else if (!health.quotaWarning) {
        quotaWarningNotifiedRef.current = false;
      }
    }
    return ok;
  });

  const { theme, projectName } = appState;
  const { sidebarWidth, isSidebarOpen, showAIInput, expandedFolders } = sidebarState;
  const { promptWidth, promptHistory } = promptState;
  const { aiCompletionEnabled, isReadOnly, fileContents, pendingDiffs } = editorState;
  const sessions = agentSessionState?.sessions;
  const activeSessionId = agentSessionState?.activeSessionId;
  const { openTabs, activeTabId, lastCodeTabId } = tabState || {};
  const { logs } = logState || {};
  const { htmlContent } = previewState || {};
  const { val: promptDraft, selectedModel } = promptUiState || {};
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
    if (!Array.isArray(promptHistory)) return undefined;
    const timer = setTimeout(() => {
      persistRef.current(Settings.setPromptHistory(promptHistory));
    }, 400);
    return () => clearTimeout(timer);
  }, [promptHistory]);

  useEffect(() => {
    if (!Array.isArray(openTabs)) return undefined;
    const timer = setTimeout(() => {
      persistRef.current(Settings.setOpenTabs(openTabs));
    }, 400);
    return () => clearTimeout(timer);
  }, [openTabs]);

  useEffect(() => {
    Settings.setActiveTabId(activeTabId || null);
  }, [activeTabId]);

  useEffect(() => {
    Settings.setLastCodeTabId(lastCodeTabId || null);
  }, [lastCodeTabId]);

  useEffect(() => {
    if (!Array.isArray(logs)) return undefined;
    const timer = setTimeout(() => {
      void Promise.resolve(Settings.setAILogs(logs)).then((ok) => persistRef.current(ok));
    }, 500);
    return () => clearTimeout(timer);
  }, [logs]);

  useEffect(() => {
    if (htmlContent === undefined) return undefined;
    const timer = setTimeout(() => {
      void Promise.resolve(Settings.setPreviewHtml(htmlContent || null)).then((ok) =>
        persistRef.current(ok),
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [htmlContent]);

  useEffect(() => {
    if (!fileContents || typeof fileContents !== 'object') return undefined;
    const timer = setTimeout(() => {
      void Promise.resolve(Settings.setFileContents({ ...fileContents })).then((ok) =>
        persistRef.current(ok),
      );
    }, 1000);
    return () => clearTimeout(timer);
  }, [fileContents]);

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
      void Promise.resolve(Settings.setPendingDiffs(diffsToSave)).then((ok) =>
        persistRef.current(ok),
      );
    }, 1000);
    return () => clearTimeout(timer);
  }, [pendingDiffs, fileContents]);

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
        persistRef.current(ok);
        if (ok) {
          Settings.setActiveAgentSessionId(payload.activeSessionId);
        }
      });
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [sessions, activeSessionId]);

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
      ).then((ok) => persistRef.current(ok));
    }, 500);
    return () => clearTimeout(timer);
  }, [changeSetState, changeSetActiveId, changeSetItems]);
}
