import { RECOMMENDED_WEB_LLM_MODEL, WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import { WebLLMState } from '@/components/AI/WebLLMState';
import { AppState } from '@/components/App/AppState';
import type { WelcomeRequest } from '@/components/App/Panes/Prompt/prompt-types';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { useFileSystem } from '@/components/Storage';
import type { TreeNode } from '@/components/state/domain-types';
import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent, MouseEvent } from 'react';
import { requireStore } from '../../types';
import { AgentSessionState, createSessionMessage } from './AgentSessions';
import FileScopeDialog from './FileScopeDialog';
import useModelDownloader from './ModelDownloader';
import PromptContent from './PromptContent';
import usePromptHistory from './PromptHistory';
import { PromptState, PromptUiState, getInitialPromptUiState } from './PromptState';
import { parseFileCommand } from './filePrompt';
import useAgentRunner from './useAgentRunner';
import usePromptLayout from './usePromptLayout';
import usePromptSessionControls from './usePromptSessionControls';

export { PromptState, PromptUiState } from './PromptState';

function collectProjectFiles(nodes: TreeNode[], parentPath: string[] = []): string[] {
  return nodes.flatMap((node) => {
    const path = node.path || [...parentPath, node.name];
    return node.type === 'file' ? [path.join('/')] : collectProjectFiles(node.children || [], path);
  });
}

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
  const agentSessionState = requireStore(
    AgentSessionState.useState(['sessions', 'activeSessionId']),
  );
  const isOpen = isMobile ? sidebarState.isAIInputPopupOpen : sidebarState.showAIInput;
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const [filePickerQuery, setFilePickerQuery] = useState('');
  const [filePromptRemainder, setFilePromptRemainder] = useState('');
  const [isFileScopeArmed, setIsFileScopeArmed] = useState(false);

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
      if (!event.shiftKey) handleSubmit(event);
    } else if (event.key === 'ArrowUp') {
      handleArrowUp();
    } else if (event.key === 'ArrowDown') {
      handleArrowDown();
    }
  };

  const handleComposerChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      const fileCommand = parseFileCommand(nextValue);
      if (fileCommand) {
        setFilePromptRemainder(fileCommand.prompt);
        setFilePickerQuery('');
        setIsFilePickerOpen(true);
        promptUiState((draft) => {
          draft.val = fileCommand.prompt;
          if (historyIndex === -1) draft.draftVal = fileCommand.prompt;
        });
        return;
      }
      promptUiState((draft) => {
        draft.val = nextValue;
        if (historyIndex === -1) draft.draftVal = nextValue;
      });
    },
    [historyIndex, promptUiState],
  );
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement> | KeyboardEvent<HTMLTextAreaElement>) => {
      send(event as FormEvent<HTMLFormElement>);
      setIsFileScopeArmed(false);
      promptUiState((draft) => {
        draft.promptScope = 'project';
      });
    },
    [promptUiState, send],
  );
  const handleFileSelect = useCallback(
    (filePath: string) => {
      const fileName = filePath.split('/').pop() || filePath;
      const fileContent = editorState.fileContents?.[filePath] || '';
      tabState((draft) => {
        if (!draft.openTabs.some((tab) => tab.id === filePath)) {
          draft.openTabs = [
            ...draft.openTabs,
            {
              id: filePath,
              type: 'file',
              label: fileName,
              file: { name: fileName, path: filePath.split('/'), content: fileContent },
            },
          ];
        }
        draft.activeTabId = filePath;
      });
      promptUiState((draft) => {
        draft.promptScope = 'file';
        draft.val = filePromptRemainder;
        draft.draftVal = filePromptRemainder;
      });
      setIsFileScopeArmed(true);
      setIsFilePickerOpen(false);
      setFilePromptRemainder('');
      setFilePickerQuery('');
    },
    [editorState.fileContents, filePromptRemainder, promptUiState, tabState],
  );
  const handleFilePickerCancel = useCallback(() => {
    setIsFilePickerOpen(false);
    setFilePromptRemainder('');
    setFilePickerQuery('');
    setIsFileScopeArmed(false);
    promptUiState((draft) => {
      draft.promptScope = 'project';
    });
  }, [promptUiState]);
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
          draft.openTabs = [...draft.openTabs, { id, type: 'ai-section', label }];
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
        isAIProcessing={isAIProcessing}
        isSystemProcessing={isSystemProcessing}
        activeSession={activeSession}
        sessionReasoning={activeSession?.reasoning || ''}
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
        modelOptions={modelOptions}
        onOpenSectionInTab={openSectionInTab}
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
        onSubmit={handleSubmit}
        onStop={handleStop}
        isButtonActive={Boolean(val.trim()) && !isAIProcessing}
        isModelDownloading={isModelDownloading}
        modelDownloadProgress={modelDownloadProgress}
        onChangeModel={setSelectedModel}
        onLoadCachedModelIds={loadCachedModelIds}
        onOpenModelManager={openModelManager}
        patchSession={patchSession}
        latestManagerTrace={latestManagerTrace}
        traceFiles={editorState.fileContents}
        onReplayRequest={replayManagerRequest}
      />
      <FileScopeDialog
        isOpen={isFilePickerOpen}
        files={[
          ...Object.keys(editorState.fileContents || {}),
          ...collectProjectFiles(sidebarState.folderTree || []),
        ]}
        query={filePickerQuery}
        onQueryChange={setFilePickerQuery}
        onSelect={handleFileSelect}
        onCancel={handleFilePickerCancel}
      />
    </>
  );
}
