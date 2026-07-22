import { serializeAgentSessions } from '@/components/App/Panes/Prompt/AgentSessions';
import Settings from '@/components/Storage/Settings';
import { useEffect } from 'react';

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
) {
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
    if (Array.isArray(promptHistory)) {
      Settings.setPromptHistory(promptHistory);
    }
  }, [promptHistory]);

  useEffect(() => {
    if (Array.isArray(openTabs)) {
      Settings.setOpenTabs(openTabs);
    }
  }, [openTabs]);

  useEffect(() => {
    Settings.setActiveTabId(activeTabId || null);
  }, [activeTabId]);

  useEffect(() => {
    Settings.setLastCodeTabId(lastCodeTabId || null);
  }, [lastCodeTabId]);

  useEffect(() => {
    if (Array.isArray(logs)) {
      Settings.setAILogs(logs);
    }
  }, [logs]);

  useEffect(() => {
    Settings.setPreviewHtml(htmlContent || null);
  }, [htmlContent]);

  useEffect(() => {
    if (!fileContents || typeof fileContents !== 'object') return undefined;
    const timer = setTimeout(() => {
      Settings.setFileContents({ ...fileContents });
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
      Settings.setPendingDiffs(diffsToSave);
    }, 1000);
    return () => clearTimeout(timer);
  }, [pendingDiffs, fileContents]);

  useEffect(() => {
    if (!sessions || !activeSessionId) return;
    const payload = serializeAgentSessions({ sessions, activeSessionId });
    Settings.setAgentSessions(payload);
    Settings.setActiveAgentSessionId(payload.activeSessionId);
  }, [sessions, activeSessionId]);
}
