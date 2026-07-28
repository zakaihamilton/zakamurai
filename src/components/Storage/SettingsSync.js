import { serializeAgentSessions } from '@/components/App/Panes/Prompt/AgentSessions';
import { reportDiagnostic } from '@/components/Diagnostics';
import Settings from '@/components/Storage/Settings';
import {
  StorageHealthState,
  requestRecoveryExport,
  storageFailureMessage,
  storageHealthMessage,
} from '@/components/Storage/StorageHealth';
import { useNotification } from '@/components/ui/Notification';
import { useEffect, useRef } from 'react';

const SAVE_FAIL_MESSAGE =
  'Could not save project data — browser storage is full. Export or free space to avoid data loss.';

export function useSettingsSync(
  appState,
  sidebarState,
  promptState,
  editorState,
  agentSessionState,
  tabState,
  logState,
  previewState,
  promptUiState,
  workspaceProfileState = null,
  changeSetState = null,
) {
  const { addNotification } = useNotification();
  const storageHealthState = StorageHealthState.usePassiveState();
  const updateStorageHealth = (update) => {
    if (typeof storageHealthState === 'function') storageHealthState(update);
  };
  const addNotificationRef = useRef(addNotification);
  addNotificationRef.current = addNotification;
  const saveFailureNotifiedRef = useRef(false);
  const quotaWarningNotifiedRef = useRef(false);

  const persistRef = useRef((ok) => {
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
        draft.usage = health.usage ?? null;
        draft.quota = health.quota ?? null;
        draft.lastSuccessfulPersistAt = health.lastSuccessfulPersistAt ?? null;
        draft.message = storageHealthMessage(health);
      });
      if (health.quotaWarning && !quotaWarningNotifiedRef.current) {
        quotaWarningNotifiedRef.current = true;
        addNotificationRef.current(storageHealthMessage(health), 'warning', 12000, {
          label: 'Export ZIP',
          onClick: requestRecoveryExport,
        });
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
  const workspaceProfile = workspaceProfileState || {};
  const { activeId: changeSetActiveId = null, items: changeSetItems = [] } = changeSetState || {};

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
      const diffsToSave = {};
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
    const timer = setTimeout(() => {
      const payload = serializeAgentSessions({ sessions, activeSessionId });
      void Promise.resolve(Settings.setAgentSessions(payload)).then((ok) => {
        persistRef.current(ok);
        if (ok) {
          Settings.setActiveAgentSessionId(payload.activeSessionId);
        }
      });
    }, 500);
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
