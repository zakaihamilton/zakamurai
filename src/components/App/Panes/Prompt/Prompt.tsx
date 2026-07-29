import { RECOMMENDED_WEB_LLM_MODEL, WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import { WebLLMState } from '@/components/AI/WebLLMState';
import { AppState } from '@/components/App/AppState';
import type { WelcomeRequest } from '@/components/App/Panes/Prompt/prompt-types';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { useFileSystem } from '@/components/Storage';
import { useCallback, useEffect } from 'react';
import type { ChangeEvent, KeyboardEvent, MouseEvent } from 'react';
import { requireStore } from '../../types';
import { AgentSessionState, createSessionMessage } from './AgentSessions';
import useModelDownloader from './ModelDownloader';
import PromptContent from './PromptContent';
import usePromptHistory from './PromptHistory';
import { PromptState, PromptUiState, getInitialPromptUiState } from './PromptState';
import useAgentRunner from './useAgentRunner';
import usePromptLayout from './usePromptLayout';
import usePromptSessionControls from './usePromptSessionControls';

export { PromptState, PromptUiState } from './PromptState';

export default function Prompt() {
  const { isMobile } = requireStore(AppState.useState(['isMobile']));
  const fs = useFileSystem();
  const promptState = requireStore(PromptState.useState(['promptWidth']));
  const { promptWidth } = promptState;
  const promptUiState = requireStore(
    PromptUiState.useState(null, {
      ...getInitialPromptUiState(),
      animatedWidth: promptState?.promptWidth ?? 0,
    }),
  );
  const {
    val = '',
    historyIndex = -1,
    draftVal = '',
    isReasoningVisible = true,
    selectedModel = RECOMMENDED_WEB_LLM_MODEL.id,
    isModelManagerOpen = false,
    isRoleGraphOpen = false,
    modelCacheWork = null,
    modelCacheProgress = '',
    modelCacheError = '',
    animatedWidth = promptState?.promptWidth ?? 0,
    abortController = null,
    promptScope = 'project',
    welcomeRequest = null,
    runningSessionId = null,
    sessionDialog = null,
    isAgentTreeOpen = false,
  } = promptUiState || {};
  const { cachedModelIds = [], engines = {} } = requireStore(
    WebLLMState.useState(['cachedModelIds', 'engines']),
  );
  const logState = requireStore(LogState.useState());
  const { isSystemProcessing, isAIProcessing } = requireStore(
    LogState.useState(['isSystemProcessing', 'isAIProcessing']),
  );
  const sidebarState = requireStore(SidebarState.useState(['showAIInput', 'isAIInputPopupOpen']));
  const tabState = requireStore(TabState.useState(['activeTabId', 'openTabs']));
  const editorState = requireStore(EditorState.useState(['selectedLines']));
  const agentSessionState = requireStore(
    AgentSessionState.useState(['sessions', 'activeSessionId']),
  );
  const isOpen = isMobile ? sidebarState.isAIInputPopupOpen : sidebarState.showAIInput;

  const {
    activeSession,
    patchSession,
    pushSessionMessage,
    openRoleGraph,
    closeRoleGraph,
    handleCreateSession,
    handleRenameSession,
    handleDeleteSession,
    handleBranchSession,
    handleSelectSession,
    handleModeChange,
  } = usePromptSessionControls({
    agentSessionState,
    promptUiState,
    selectedModel,
    isAIProcessing,
    isRoleGraphOpen,
  });
  const { desktopWidth } = usePromptLayout({
    isMobile,
    isOpen,
    promptWidth,
    animatedWidth,
    promptUiState,
  });
  const { loadCachedModelIds, openModelManager, closeModelManager, handleModelCacheAction } =
    useModelDownloader(promptUiState);
  const { handleArrowUp, handleArrowDown, addToHistory } = usePromptHistory(
    val,
    historyIndex,
    draftVal,
    promptUiState,
  );
  const { send, handleStop } = useAgentRunner({
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
  });

  useEffect(() => {
    if (!welcomeRequest || isAIProcessing || !activeSession) return;

    const request = welcomeRequest as WelcomeRequest;
    promptUiState((draft) => {
      draft.welcomeRequest = null;
    });
    tabState((draft) => {
      const id = 'ai-section:reasoning';
      if (!draft.openTabs.some((tab) => tab.id === id)) {
        draft.openTabs = [
          ...draft.openTabs,
          { id, type: 'ai-section', label: 'Progress & Reasoning' },
        ];
      }
      draft.activeTabId = id;
    });
    send(null, request.text, request.scope);
  }, [activeSession, isAIProcessing, promptUiState, send, tabState, welcomeRequest]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const mac = navigator.platform.toUpperCase().includes('MAC');
    if ((mac ? event.metaKey : event.ctrlKey) && event.key === '.') {
      handleStop(event as unknown as MouseEvent<HTMLButtonElement>);
      return;
    }
    if (event.key === 'Enter') {
      if (event.metaKey || event.ctrlKey) {
        event.preventDefault();
        event.stopPropagation();
        const target = event.target as HTMLTextAreaElement;
        const { selectionStart, selectionEnd, value } = target;
        const nextValue = `${value.substring(0, selectionStart)}\n${value.substring(selectionEnd)}`;
        promptUiState((draft) => {
          draft.val = nextValue;
        });
        requestAnimationFrame(() => {
          target.selectionStart = target.selectionEnd = selectionStart + 1;
        });
        return;
      }
      if (!event.shiftKey) send(event);
    } else if (event.key === 'ArrowUp') {
      handleArrowUp();
    } else if (event.key === 'ArrowDown') {
      handleArrowDown();
    }
  };

  const handleComposerChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      promptUiState((draft) => {
        draft.val = event.target.value;
        if (historyIndex === -1) draft.draftVal = event.target.value;
      });
    },
    [historyIndex, promptUiState],
  );
  const setPromptScope = useCallback(
    (scope: string) => {
      promptUiState((draft) => {
        draft.promptScope = scope;
      });
    },
    [promptUiState],
  );
  const openSectionInTab = useCallback(
    (section: 'context' | 'changes' | 'transcript' | 'reasoning') => {
      const id = `ai-section:${section}`;
      const label =
        section === 'context'
          ? 'AI Context'
          : section === 'changes'
            ? 'Change Set'
            : section === 'transcript'
              ? 'Transcript'
              : 'Progress & Reasoning';
      tabState((draft) => {
        const existingTab = draft.openTabs.find((tab) => tab.id === id);
        if (!existingTab) {
          draft.openTabs = [...draft.openTabs, { id, type: 'ai-section', label }];
        }
        draft.activeTabId = id;
      });
    },
    [tabState],
  );
  const toggleReasoning = useCallback(() => {
    promptUiState((draft) => {
      draft.isReasoningVisible = !draft.isReasoningVisible;
    });
  }, [promptUiState]);
  const openSessionTree = useCallback(() => {
    promptUiState((draft) => {
      draft.isAgentTreeOpen = true;
    });
  }, [promptUiState]);
  const closeSessionTree = useCallback(() => {
    promptUiState((draft) => {
      draft.isAgentTreeOpen = false;
    });
  }, [promptUiState]);
  const setSelectedModel = useCallback(
    (modelId: string) => {
      promptUiState((draft) => {
        draft.selectedModel = modelId;
      });
    },
    [promptUiState],
  );

  const currentActiveTabId = tabState.activeTabId;
  const currentActiveTab = tabState.openTabs.find((tab) => tab.id === currentActiveTabId);
  const selectedLines =
    (currentActiveTabId && editorState.selectedLines?.[currentActiveTabId]) || [];
  const selectedLineText =
    selectedLines.length > 0 ? [...selectedLines].sort((a, b) => a - b).join(', ') : 'None';
  const activeFileName =
    currentActiveTab?.type === 'file' && currentActiveTabId
      ? currentActiveTabId.split('/').pop()
      : 'No file selected';
  const activeFilePath =
    currentActiveTab?.type === 'file' && currentActiveTabId ? currentActiveTabId : 'Open a file';
  const runState = isAIProcessing ? 'AI working' : isSystemProcessing ? 'Compiling' : 'Ready';
  const selectedModelInfo =
    WEB_LLM_MODELS.find((model) => model.id === selectedModel) || RECOMMENDED_WEB_LLM_MODEL;
  const selectedModelEngine = engines[selectedModel];
  const isModelDownloading = selectedModelEngine?.status === 'downloading';
  const modelDownloadProgress = selectedModelEngine?.progressText || '';
  const modelOptions = WEB_LLM_MODELS.map((model) => ({
    value: model.id,
    label: model.name,
    description: model.requirement,
    badges: [
      model.recommended ? 'Recommended' : '',
      cachedModelIds.includes(model.id) ? 'Cached' : '',
    ].filter(Boolean),
  }));

  return (
    <PromptContent
      isMobile={isMobile}
      isOpen={isOpen}
      desktopWidth={desktopWidth}
      isAIProcessing={isAIProcessing}
      isSystemProcessing={isSystemProcessing}
      activeSession={activeSession}
      sessionReasoning={activeSession?.reasoning || ''}
      isReasoningVisible={isReasoningVisible}
      onToggleReasoning={toggleReasoning}
      onModeChange={handleModeChange}
      onOpenTree={openSessionTree}
      isAgentTreeOpen={isAgentTreeOpen}
      sessionDialog={sessionDialog}
      agentSessionState={agentSessionState}
      onCloseTree={closeSessionTree}
      onSelectSession={handleSelectSession}
      onCreateSession={handleCreateSession}
      onBranchSession={handleBranchSession}
      onRenameSession={handleRenameSession}
      onDeleteSession={handleDeleteSession}
      runningSessionId={runningSessionId}
      promptUiState={promptUiState}
      isRoleGraphOpen={isRoleGraphOpen}
      onOpenRoleGraph={openRoleGraph}
      onCloseRoleGraph={closeRoleGraph}
      modelOptions={modelOptions}
      selectedModel={selectedModel}
      promptScope={promptScope}
      onScopeChange={setPromptScope}
      onOpenSectionInTab={openSectionInTab}
      activeFileName={activeFileName}
      activeFilePath={activeFilePath}
      selectedLines={selectedLines}
      selectedLineText={selectedLineText}
      runState={runState}
      isModelManagerOpen={isModelManagerOpen}
      selectedModelInfo={selectedModelInfo}
      cachedModelIds={cachedModelIds}
      onCloseModelManager={closeModelManager}
      onModelCacheAction={handleModelCacheAction}
      modelCacheWork={modelCacheWork as string | null}
      modelCacheProgress={modelCacheProgress}
      modelCacheError={modelCacheError}
      value={val}
      onChange={handleComposerChange}
      onKeyDown={handleKeyDown}
      onSubmit={send}
      onStop={handleStop}
      isButtonActive={Boolean(val.trim()) && !isAIProcessing}
      isModelDownloading={isModelDownloading}
      modelDownloadProgress={modelDownloadProgress}
      onChangeModel={setSelectedModel}
      onLoadCachedModelIds={loadCachedModelIds}
      onOpenModelManager={openModelManager}
      patchSession={patchSession}
    />
  );
}
