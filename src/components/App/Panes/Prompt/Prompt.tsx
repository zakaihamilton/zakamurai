import {
  createProjectStyleProfile,
  resolveProjectStyleProfile,
} from '@/components/AI/Agent/ProjectStyleProfile';
import { useModelDownloader } from '@/components/AI/Models';
import { RECOMMENDED_WEB_LLM_MODEL, WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import { WebLLMState } from '@/components/AI/WebLLMState';
import { AppState } from '@/components/App/AppState';
import type { WelcomeRequest } from '@/components/App/Panes/Prompt/prompt-types';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { useFileSystem } from '@/components/Storage';
import { WorkspaceProfileState } from '@/components/Workspace';
import { useCallback, useEffect, useRef, useState } from 'react';
import { requireStore } from '../../types';
import { AgentSessionState, createAgentRunUsage, createSessionMessage } from './AgentSessions';
import FileScopeDialog from './FileScopeDialog';
import PromptContent from './PromptContent';
import usePromptHistory from './PromptHistory';
import { PromptState, PromptUiState, getInitialPromptUiState } from './PromptState';
import useAgentRunner from './useAgentRunner';
import usePromptComposer from './usePromptComposer';
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
    selectedModel = RECOMMENDED_WEB_LLM_MODEL.id,
    isModelManagerOpen = false,
    modelCacheWork = null,
    modelCacheProgress = '',
    modelCacheError = '',
    animatedWidth = promptState?.promptWidth ?? 0,
    abortController = null,
    welcomeRequest = null,
    runningSessionId = null,
    stopRequest = 0,
    sessionDialog = null,
    isAgentTreeOpen = false,
    latestManagerTrace = null,
  } = promptUiState || {};
  const { cachedModelIds = [], engines = {} } = requireStore(
    WebLLMState.useState(['cachedModelIds', 'engines']),
  );
  const logState = requireStore(LogState.useState());
  const { isSystemProcessing, isAIProcessing } = requireStore(
    LogState.useState(['isSystemProcessing', 'isAIProcessing']),
  );
  const sidebarState = requireStore(
    SidebarState.useState(['showAIInput', 'isAIInputPopupOpen', 'folderTree']),
  );
  const tabState = requireStore(TabState.useState(['activeTabId', 'openTabs']));
  const editorState = requireStore(EditorState.useState(['selectedLines', 'fileContents']));
  const workspaceProfileState = requireStore(WorkspaceProfileState.useState(['styleProfile']));
  const agentSessionState = requireStore(
    AgentSessionState.useState(['sessions', 'activeSessionId']),
  );
  const isOpen = isMobile ? sidebarState.isAIInputPopupOpen : sidebarState.showAIInput;
  const [filePromptRemainder, setFilePromptRemainder] = useState('');
  const [isFileScopeArmed, setIsFileScopeArmed] = useState(false);
  const lastStopRequestRef = useRef(0);
  const styleProfile = resolveProjectStyleProfile(
    editorState.fileContents || {},
    workspaceProfileState.styleProfile,
  );

  useEffect(() => {
    const current = workspaceProfileState.styleProfile;
    if (
      current?.fingerprint === styleProfile.fingerprint &&
      current.source === styleProfile.source
    ) {
      return;
    }
    workspaceProfileState((draft) => {
      draft.styleProfile = styleProfile;
    });
  }, [styleProfile, workspaceProfileState]);

  const {
    activeSession,
    patchSession,
    pushSessionMessage,
    handleCreateSession,
    handleRenameSession,
    handleDeleteSession,
    handleBranchSession,
    handleSelectSession,
  } = usePromptSessionControls({
    agentSessionState,
    promptUiState,
    selectedModel,
    isAIProcessing,
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
    promptScope: isFileScopeArmed ? 'file' : 'project',
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
    cachedModelIds,
    webLLMEngines: engines,
    styleProfile,
  });

  useEffect(() => {
    if (stopRequest === lastStopRequestRef.current) return;
    lastStopRequestRef.current = stopRequest;
    if (stopRequest > 0 && isAIProcessing) handleStop();
  }, [handleStop, isAIProcessing, stopRequest]);

  const handleClearAIModelLog = useCallback(() => {
    if (!activeSession) return;
    patchSession(activeSession.id, {
      messages: [],
      reasoning: '',
      reasoningEvents: [],
      runUsage: createAgentRunUsage(),
      ...(activeSession.status === 'error' ? { status: 'idle' } : {}),
    });
  }, [activeSession, patchSession]);

  const {
    isFilePickerOpen,
    filePickerQuery,
    files,
    handleKeyDown,
    handleChange: handleComposerChange,
    handleSubmit,
    handleFileSelect,
    handleFilePickerCancel,
    setFilePickerQuery,
  } = usePromptComposer({
    promptUiState,
    editorState,
    tabState,
    sidebarState,
    historyIndex,
    fileScopeArmed: isFileScopeArmed,
    setFileScopeArmed: setIsFileScopeArmed,
    filePromptRemainder,
    setFilePromptRemainder,
    send,
    handleStop,
    handleArrowUp,
    handleArrowDown,
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
          { id, type: 'ai-section', label: 'Progress & Reasoning', viewType: 'visual' },
        ];
      }
      draft.activeTabId = id;
    });
    send(null, request.text, request.scope, true);
  }, [activeSession, isAIProcessing, promptUiState, send, tabState, welcomeRequest]);

  const replayManagerRequest = useCallback(
    (request: string) => {
      promptUiState((draft) => {
        draft.val = request;
        draft.draftVal = request;
        draft.historyIndex = -1;
      });
    },
    [promptUiState],
  );
  const openSectionInTab = useCallback(
    (section: 'changes' | 'reasoning') => {
      const id = `ai-section:${section}`;
      const label = section === 'changes' ? 'Change Set' : 'Progress & Reasoning';
      tabState((draft) => {
        const existingTab = draft.openTabs.find((tab) => tab.id === id);
        if (!existingTab) {
          draft.openTabs = [
            ...draft.openTabs,
            {
              id,
              type: 'ai-section',
              label,
              ...(section === 'reasoning' ? { viewType: 'visual' } : {}),
            },
          ];
        }
        draft.activeTabId = id;
      });
    },
    [tabState],
  );
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
  const refreshProjectStyle = useCallback(() => {
    workspaceProfileState((draft) => {
      draft.styleProfile = createProjectStyleProfile(editorState.fileContents || {});
    });
  }, [editorState.fileContents, workspaceProfileState]);

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
    <>
      <PromptContent
        isMobile={isMobile}
        isOpen={isOpen}
        desktopWidth={desktopWidth}
        header={{
          isAIProcessing,
          isSystemProcessing,
          latestManagerTrace,
          traceFiles: editorState.fileContents,
          onReplayRequest: replayManagerRequest,
        }}
        session={{
          activeSession,
          isOpen,
          isAgentTreeOpen,
          sessionDialog,
          agentSessionState,
          onOpenTree: openSessionTree,
          onCloseTree: closeSessionTree,
          onSelectSession: handleSelectSession,
          onCreateSession: handleCreateSession,
          onBranchSession: handleBranchSession,
          onRenameSession: handleRenameSession,
          onDeleteSession: handleDeleteSession,
          runningSessionId,
          isAIProcessing,
          promptUiState,
        }}
        activity={{
          activeSession,
          onOpenSectionInTab: openSectionInTab,
          isModelManagerOpen,
          selectedModelInfo,
          cachedModelIds,
          onCloseModelManager: closeModelManager,
          onModelCacheAction: handleModelCacheAction,
          modelCacheWork: modelCacheWork as string | null,
          modelCacheProgress,
          modelCacheError,
          isModelDownloading,
          modelDownloadProgress,
          patchSession,
          onClearAIModelLog: handleClearAIModelLog,
        }}
        composer={{
          value: val,
          onChange: handleComposerChange,
          onKeyDown: handleKeyDown,
          onSubmit: handleSubmit,
          onStop: handleStop,
          isAIProcessing,
          isButtonActive: Boolean(val.trim()) && !isAIProcessing,
          isOpen,
          selectedModelInfo,
          modelOptions,
          onChangeModel: setSelectedModel,
          onLoadCachedModelIds: loadCachedModelIds,
          onOpenModelManager: openModelManager,
          onRefreshProjectStyle: refreshProjectStyle,
        }}
        sessionReasoning={activeSession?.reasoning || ''}
      />
      <FileScopeDialog
        isOpen={isFilePickerOpen}
        files={files}
        query={filePickerQuery}
        onQueryChange={setFilePickerQuery}
        onSelect={handleFileSelect}
        onCancel={handleFilePickerCancel}
      />
    </>
  );
}
