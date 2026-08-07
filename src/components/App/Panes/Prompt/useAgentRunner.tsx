import { AppState } from '@/components/App/AppState';
import { ChangeSetState } from '@/components/Workspace';
import type { FormEvent } from 'react';
import { useCallback } from 'react';
import { requireStore } from '../../types';
import { createAgentRunUsage } from './AgentSessions';
import { formatAgentEvent } from './agentRun/formatAgentEvent';
import { runAgentRequest } from './agentRun/runAgentRequest';
import type { AgentEventFormatter, UseAgentRunnerParams } from './prompt-types';

export { formatAgentEvent };
export type { AgentEventFormatter };

export default function useAgentRunner({
  val,
  isAIProcessing,
  activeSession,
  agentSessionState,
  promptUiState,
  promptScope,
  selectedModel,
  abortController,
  runningSessionId,
  addToHistory,
  patchSession,
  pushSessionMessage,
  createSessionMessage,
  fs,
  tabState,
  editorState,
  sidebarState,
  logState,
  cachedModelIds = [],
  webLLMEngines = {},
}: UseAgentRunnerParams) {
  const changeSetState = requireStore(ChangeSetState.usePassiveState());
  const appState = requireStore(AppState.usePassiveState());

  const handleStop = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      abortController?.abort();
      import('@/components/AI/WebLLMAPI').then(({ interruptWebLLM }) => interruptWebLLM());
      const sessionId = runningSessionId || agentSessionState?.activeSessionId;
      if (sessionId) {
        patchSession(sessionId, { status: 'idle', reasoning: '', reasoningEvents: [] });
        pushSessionMessage(
          sessionId,
          createSessionMessage({ role: 'system', text: 'AI Manager stopped by user.' }),
        );
      }
      promptUiState((draft) => {
        draft.runningSessionId = null;
        draft.abortController = null;
      });
      logState((draft) => {
        draft.isAIProcessing = false;
        draft.logs = [
          ...draft.logs,
          {
            id: Date.now(),
            role: 'system',
            text: 'AI Manager stopped by user.',
            timestamp: new Date().toTimeString().split(' ')[0],
          },
        ];
      });
    },
    [
      abortController,
      agentSessionState,
      createSessionMessage,
      logState,
      patchSession,
      promptUiState,
      pushSessionMessage,
      runningSessionId,
    ],
  );

  const send = useCallback(
    (
      e: FormEvent | null = null,
      request: string | null = null,
      scope: string | null = null,
      isWelcomePrompt = false,
    ) => {
      e?.preventDefault?.();
      const userMsg = typeof request === 'string' ? request : val;
      const effectiveScope = scope || promptScope;
      if (!userMsg.trim() || isAIProcessing || !activeSession) return;

      const sessionId = activeSession.id;
      addToHistory(userMsg);
      const currentActiveTabId = tabState.activeTabId;
      const currentActiveTab = tabState.openTabs.find((tab) => tab.id === currentActiveTabId);
      const autoApproveInitialProject =
        activeSession.messages.length === 0 &&
        Object.keys(editorState.fileContents || {}).length === 0 &&
        (sidebarState.folderTree || []).length === 0;
      const shouldAutoApprove = isWelcomePrompt || autoApproveInitialProject;

      pushSessionMessage(sessionId, createSessionMessage({ role: 'user', text: userMsg }));
      patchSession(sessionId, {
        status: 'running',
        reasoning: '',
        reasoningEvents: [],
        runUsage: createAgentRunUsage(),
      });
      promptUiState((draft) => {
        draft.val = '';
        draft.draftVal = '';
        draft.historyIndex = -1;
        draft.runningSessionId = sessionId;
        draft.latestManagerTrace = null;
        draft.latestAIIncident = null;
      });
      logState((draft) => {
        draft.isAIProcessing = true;
        draft.reasoning = '';
        draft.logs = [
          ...draft.logs,
          {
            id: Date.now(),
            role: 'system',
            text: 'AI Manager started.',
            timestamp: new Date().toTimeString().split(' ')[0],
          },
        ];
      });

      void runAgentRequest({
        userMsg,
        sessionId,
        effectiveScope,
        isWelcomePrompt,
        autoApproveInitialProject,
        shouldAutoApprove,
        currentActiveTabId,
        currentActiveTab,
        fs,
        editorState,
        sidebarState,
        tabState,
        logState,
        promptUiState,
        appState,
        changeSetState,
        selectedModel,
        cachedModelIds,
        webLLMEngines,
        patchSession,
        pushSessionMessage,
        createSessionMessage,
      });
    },
    [
      activeSession,
      addToHistory,
      appState,
      changeSetState,
      createSessionMessage,
      editorState,
      fs,
      isAIProcessing,
      logState,
      cachedModelIds,
      webLLMEngines,
      patchSession,
      promptScope,
      promptUiState,
      pushSessionMessage,
      selectedModel,
      sidebarState,
      tabState,
      val,
    ],
  );

  return { send, handleStop };
}
