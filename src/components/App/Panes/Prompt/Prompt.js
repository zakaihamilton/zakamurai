import { RECOMMENDED_WEB_LLM_MODEL, WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import { WebLLMState } from '@/components/AI/WebLLMState';
import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { useFileSystem } from '@/components/Storage';
import React, { useCallback, useEffect } from 'react';
import {
  AgentSessionState,
  addAgentSession,
  appendSessionMessage,
  createDefaultAgentSessions,
  createSessionMessage,
  deleteAgentSession,
  getActiveAgentSession,
  listAgentSessions,
  renameAgentSession,
  setActiveAgentSession,
  updateAgentSession,
} from './AgentSessions';
import ChangeSetPanel from './ChangeSet';
import PromptComposer from './Composer';
import PromptContextPanel from './Context';
import PromptHeader from './Header';
import useModelDownloader from './ModelDownloader';
import ModelDownloader from './ModelManager';
import styles from './Prompt.module.css';
import usePromptHistory from './PromptHistory';
import { PromptState, PromptUiState, getInitialPromptUiState } from './PromptState';
import ReasoningPanel from './Reasoning';
import { RoleGraphDialog, RoleGraphSummary } from './RoleGraph';
import { SessionDialog, SessionManager, SessionTranscript } from './Session';
import useAgentRunner from './useAgentRunner';

export { PromptState, PromptUiState } from './PromptState';

export default function Prompt() {
  const { isMobile } = AppState.useState(['isMobile']);
  const fs = useFileSystem();
  const promptState = PromptState.useState(['promptWidth']);
  const { promptWidth } = promptState;
  const promptUiState = PromptUiState.useState(null, {
    ...getInitialPromptUiState(),
    animatedWidth: promptState?.promptWidth ?? 0,
  });
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
    promptScope = 'file',
    runningSessionId = null,
    sessionDialog = null,
  } = promptUiState || {};
  const { cachedModelIds = [] } = WebLLMState.useState(['cachedModelIds']);

  const setAnimatedWidth = useCallback(
    (nextValue) => {
      promptUiState((draft) => {
        draft.animatedWidth =
          typeof nextValue === 'function' ? nextValue(draft.animatedWidth) : nextValue;
      });
    },
    [promptUiState],
  );

  const logState = LogState.usePassiveState();
  const { isSystemProcessing, isAIProcessing } = LogState.useState([
    'isSystemProcessing',
    'isAIProcessing',
  ]);
  const sidebarState = SidebarState.useState(['showAIInput', 'isAIInputPopupOpen']);
  const { showAIInput } = sidebarState;
  const tabState = TabState.useState(['activeTabId', 'openTabs']);
  const editorState = EditorState.useState(['selectedLines']);
  const agentSessionState = AgentSessionState.useState(['sessions', 'activeSessionId']);

  useEffect(() => {
    if (!agentSessionState) return;
    if (
      agentSessionState.activeSessionId &&
      agentSessionState.sessions?.[agentSessionState.activeSessionId]
    ) {
      return;
    }
    const defaults = createDefaultAgentSessions(selectedModel);
    agentSessionState((draft) => {
      draft.sessions = defaults.sessions;
      draft.activeSessionId = defaults.activeSessionId;
    });
  }, [agentSessionState, selectedModel]);

  const activeSession = getActiveAgentSession(agentSessionState);
  const sessionList = listAgentSessions(agentSessionState?.sessions || {});

  const { loadCachedModelIds, openModelManager, closeModelManager, handleModelCacheAction } =
    useModelDownloader(promptUiState);

  const openRoleGraph = useCallback(() => {
    promptUiState((draft) => {
      draft.isRoleGraphOpen = true;
    });
  }, [promptUiState]);

  const closeRoleGraph = useCallback(() => {
    promptUiState((draft) => {
      draft.isRoleGraphOpen = false;
    });
  }, [promptUiState]);

  const { handleArrowUp, handleArrowDown, addToHistory } = usePromptHistory(
    val,
    historyIndex,
    draftVal,
    promptUiState,
  );

  const patchSession = useCallback(
    (sessionId, patch) => {
      agentSessionState((draft) => {
        const next = updateAgentSession(
          { sessions: draft.sessions, activeSessionId: draft.activeSessionId },
          sessionId,
          patch,
        );
        draft.sessions = next.sessions;
        draft.activeSessionId = next.activeSessionId;
      });
    },
    [agentSessionState],
  );

  const pushSessionMessage = useCallback(
    (sessionId, message) => {
      agentSessionState((draft) => {
        const next = appendSessionMessage(
          { sessions: draft.sessions, activeSessionId: draft.activeSessionId },
          sessionId,
          message,
        );
        draft.sessions = next.sessions;
      });
    },
    [agentSessionState],
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

  const handleKeyDown = (e) => {
    const mac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const cmdKey = mac ? e.metaKey : e.ctrlKey;

    if (cmdKey && e.key === '.') {
      handleStop(e);
      return;
    }

    if (e.key === 'Enter') {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        const { selectionStart, selectionEnd, value } = e.target;
        const newValue = `${value.substring(0, selectionStart)}\n${value.substring(selectionEnd)}`;
        promptUiState((draft) => {
          draft.val = newValue;
        });

        requestAnimationFrame(() => {
          e.target.selectionStart = e.target.selectionEnd = selectionStart + 1;
        });
        return;
      }

      if (!e.shiftKey) {
        send(e);
      }
    } else if (e.key === 'ArrowUp') {
      handleArrowUp();
    } else if (e.key === 'ArrowDown') {
      handleArrowDown();
    }
  };

  const isBtnActive = val.trim() && !isAIProcessing;

  const currentActiveTabId = tabState.activeTabId;
  const currentActiveTab = tabState.openTabs.find((t) => t.id === currentActiveTabId);
  const selectedLines = editorState.selectedLines?.[currentActiveTabId] || [];
  const selectedLineText =
    selectedLines.length > 0 ? [...selectedLines].sort((a, b) => a - b).join(', ') : 'None';
  const activeFileName =
    currentActiveTab?.type === 'file' ? currentActiveTabId.split('/').pop() : 'No file selected';
  const activeFilePath = currentActiveTab?.type === 'file' ? currentActiveTabId : 'Open a file';
  const runState = isAIProcessing ? 'AI working' : isSystemProcessing ? 'Compiling' : 'Ready';
  const selectedModelInfo =
    WEB_LLM_MODELS.find((model) => model.id === selectedModel) || RECOMMENDED_WEB_LLM_MODEL;
  const modelOptions = WEB_LLM_MODELS.map((model) => ({
    value: model.id,
    label: model.name,
    description: model.requirement,
    badges: [
      model.recommended ? 'Recommended' : '',
      cachedModelIds.includes(model.id) ? 'Cached' : '',
    ].filter(Boolean),
  }));

  const isOpen = isMobile ? sidebarState.isAIInputPopupOpen : showAIInput;
  const sessionReasoning = activeSession?.reasoning || '';

  useEffect(() => {
    if (isMobile) return undefined;

    if (isOpen) {
      const frame = window.requestAnimationFrame(() => setAnimatedWidth(promptWidth));
      return () => window.cancelAnimationFrame(frame);
    }

    setAnimatedWidth(promptWidth);
    const frame = window.requestAnimationFrame(() => setAnimatedWidth(0));
    return () => window.cancelAnimationFrame(frame);
  }, [isMobile, isOpen, promptWidth, setAnimatedWidth]);

  useEffect(() => {
    if (activeSession?.mode !== 'team' && isRoleGraphOpen) {
      closeRoleGraph();
    }
  }, [activeSession?.mode, closeRoleGraph, isRoleGraphOpen]);

  const desktopWidth = `${animatedWidth}px`;

  const handleCreateSession = () => {
    try {
      agentSessionState((draft) => {
        const next = addAgentSession(
          { sessions: draft.sessions, activeSessionId: draft.activeSessionId },
          { modelId: selectedModel },
        );
        draft.sessions = next.sessions;
        draft.activeSessionId = next.activeSessionId;
      });
    } catch (error) {
      promptUiState((draft) => {
        draft.sessionDialog = { type: 'error', message: error.message };
      });
    }
  };

  const handleRenameSession = () => {
    if (!activeSession) return;
    promptUiState((draft) => {
      draft.sessionDialog = {
        type: 'rename',
        sessionId: activeSession.id,
        value: activeSession.name,
      };
    });
  };

  const handleDeleteSession = () => {
    if (!activeSession) return;
    if (activeSession.messages?.length) {
      promptUiState((draft) => {
        draft.sessionDialog = {
          type: 'delete',
          sessionId: activeSession.id,
          name: activeSession.name,
        };
      });
      return;
    }
    if (runningSessionId === activeSession.id && isAIProcessing) {
      promptUiState((draft) => {
        draft.sessionDialog = {
          type: 'error',
          message: 'Stop the running agent before deleting this session.',
        };
      });
      return;
    }
    agentSessionState((draft) => {
      const next = deleteAgentSession(
        { sessions: draft.sessions, activeSessionId: draft.activeSessionId },
        activeSession.id,
      );
      draft.sessions = next.sessions;
      draft.activeSessionId = next.activeSessionId;
    });
  };

  const handleSelectSession = (sessionId) => {
    agentSessionState((draft) => {
      const next = setActiveAgentSession(
        { sessions: draft.sessions, activeSessionId: draft.activeSessionId },
        sessionId,
      );
      draft.activeSessionId = next.activeSessionId;
    });
  };

  const handleModeChange = (mode) => {
    if (!activeSession || isAIProcessing) return;
    patchSession(activeSession.id, { mode });
  };

  return (
    <aside
      className={`${styles.prompt} ${isOpen ? '' : styles.closed}`}
      aria-hidden={!isOpen}
      style={isMobile ? undefined : { '--panel-width': desktopWidth }}
    >
      <div className={styles.content}>
        <PromptHeader
          isAIProcessing={isAIProcessing}
          isSystemProcessing={isSystemProcessing}
          hasReasoning={Boolean(sessionReasoning)}
          isReasoningVisible={isReasoningVisible}
          onToggleReasoning={() =>
            promptUiState((draft) => {
              draft.isReasoningVisible = !draft.isReasoningVisible;
            })
          }
          mode={activeSession?.mode || 'single'}
          onModeChange={handleModeChange}
        />
        <SessionManager
          sessions={sessionList}
          activeSessionId={agentSessionState?.activeSessionId}
          onSelect={handleSelectSession}
          onCreate={handleCreateSession}
          onRename={handleRenameSession}
          onDelete={handleDeleteSession}
          isOpen={isOpen}
        />
        <SessionDialog
          sessionDialog={sessionDialog}
          runningSessionId={runningSessionId}
          isAIProcessing={isAIProcessing}
          agentSessionState={agentSessionState}
          promptUiState={promptUiState}
        />
        {activeSession?.mode === 'team' && (
          <RoleGraphSummary
            roleGraph={activeSession.roleGraph}
            disabled={!isOpen || isAIProcessing}
            onEdit={openRoleGraph}
          />
        )}
        <PromptContextPanel
          scope={promptScope}
          onScopeChange={(scope) =>
            promptUiState((draft) => {
              draft.promptScope = scope;
            })
          }
          activeFileName={activeFileName}
          activeFilePath={activeFilePath}
          selectedLines={selectedLines}
          selectedLineText={selectedLineText}
          runState={runState}
        />
        <ChangeSetPanel />
        <SessionTranscript messages={activeSession?.messages || []} />
        <ModelDownloader
          isOpen={isModelManagerOpen}
          selectedModelId={selectedModelInfo.id}
          cachedModelIds={cachedModelIds}
          onCancel={closeModelManager}
          onModelCacheAction={handleModelCacheAction}
          modelCacheWork={modelCacheWork}
          modelCacheProgress={modelCacheProgress}
          modelCacheError={modelCacheError}
        />
        <RoleGraphDialog
          isOpen={isRoleGraphOpen}
          onCancel={closeRoleGraph}
          roleGraph={activeSession?.roleGraph}
          modelOptions={modelOptions}
          defaultModelId={selectedModel}
          disabled={isAIProcessing}
          onChange={(nextGraph) => {
            if (!activeSession) return;
            patchSession(activeSession.id, { roleGraph: nextGraph });
          }}
        />
        <ReasoningPanel />
        <PromptComposer
          value={val}
          onChange={(e) => {
            promptUiState((draft) => {
              draft.val = e.target.value;
              if (historyIndex === -1) {
                draft.draftVal = e.target.value;
              }
            });
          }}
          onKeyDown={handleKeyDown}
          onSubmit={send}
          onStop={handleStop}
          isAIProcessing={isAIProcessing}
          isButtonActive={isBtnActive}
          isOpen={isOpen}
          selectedModelInfo={selectedModelInfo}
          modelOptions={modelOptions}
          onChangeModel={(modelId) =>
            promptUiState((draft) => {
              draft.selectedModel = modelId;
            })
          }
          onLoadCachedModelIds={loadCachedModelIds}
          onOpenModelManager={openModelManager}
        />
      </div>
    </aside>
  );
}
