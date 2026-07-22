import { serializeAgentSessions } from '@/components/App/Panes/Prompt/AgentSessions';
import Settings from '@/components/Storage/Settings';
import { useEffect } from 'react';

export function useSettingsSync(
  appState,
  sidebarState,
  promptState,
  editorState,
  agentSessionState,
) {
  const { theme, projectName } = appState;
  const { sidebarWidth, isSidebarOpen, showAIInput, expandedFolders } = sidebarState;
  const { promptWidth } = promptState;
  const { aiCompletionEnabled } = editorState;
  const sessions = agentSessionState?.sessions;
  const activeSessionId = agentSessionState?.activeSessionId;

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
    if (!sessions || !activeSessionId) return;
    const payload = serializeAgentSessions({ sessions, activeSessionId });
    Settings.setAgentSessions(payload);
    Settings.setActiveAgentSessionId(payload.activeSessionId);
  }, [sessions, activeSessionId]);
}
