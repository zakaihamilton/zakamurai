import {
  RECOMMENDED_WEB_LLM_MODEL,
  WEB_LLM_MODELS,
  resolveWebLLMModelId,
} from '@/components/AI/WebLLMModels';
import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import Settings from '@/components/Storage/Settings';
import { createState } from '@/components/state/State';
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
import useModelDownloader from './ModelDownloader';
import styles from './Prompt.module.css';
import usePromptHistory from './PromptHistory';
import ModelDownloader from './subcomponents/ModelManager';
import PromptComposer from './subcomponents/PromptComposer';
import PromptContextPanel from './subcomponents/PromptContextPanel';
import PromptHeader from './subcomponents/PromptHeader';
import ReasoningPanel from './subcomponents/ReasoningPanel';
import SessionManager from './subcomponents/SessionManager';
import SessionTranscript from './subcomponents/SessionTranscript';

const ROLE_LABELS = {
  planner: 'Planner',
  coder: 'Coder',
  reviewer: 'Reviewer',
};

const formatAgentEvent = (event) => {
  const rolePrefix = event.agentRole
    ? `**${ROLE_LABELS[event.agentRole] || event.agentRole}** · `
    : '';
  if (event.type === 'thinking') {
    return `${rolePrefix}**Step ${event.turn}:** planning next action…`;
  }
  if (event.type === 'tool') {
    const target = event.action.path || event.action.query || '';
    return `${rolePrefix}**Step ${event.turn}:** \`${event.action.action}\`${target ? ` — ${target}` : ''}`;
  }
  if (event.type === 'observation') {
    return event.error ? `⚠ ${event.message}` : `${rolePrefix}${event.message}`;
  }
  if (event.type === 'finished') {
    return `${rolePrefix}**Ready for review:** ${event.message || 'Agent finished.'}`;
  }
  return '';
};

export const PromptState = createState('PromptState');
export const PromptUiState = createState('PromptUiState');
const getInitialSelectedModel = () =>
  resolveWebLLMModelId(
    Settings.getAIPromptModel(RECOMMENDED_WEB_LLM_MODEL.id) || RECOMMENDED_WEB_LLM_MODEL.id,
  );

export default function Prompt() {
  const { fs, isMobile } = AppState.useState(['fs', 'isMobile']);
  const promptState = PromptState.useState();
  const { promptWidth } = promptState;
  const promptUiState = PromptUiState.useState(null, {
    val: Settings.getPromptDraft(),
    historyIndex: -1,
    draftVal: Settings.getPromptDraft(),
    isReasoningVisible: true,
    selectedModel: getInitialSelectedModel(),
    isModelManagerOpen: false,
    cachedModelIds: [],
    modelCacheWork: null,
    modelCacheProgress: '',
    modelCacheError: '',
    animatedWidth: promptState?.promptWidth ?? 0,
    abortController: null,
    promptScope: 'file',
    runningSessionId: null,
  });
  const {
    val = '',
    historyIndex = -1,
    draftVal = '',
    isReasoningVisible = true,
    selectedModel = RECOMMENDED_WEB_LLM_MODEL.id,
    isModelManagerOpen = false,
    cachedModelIds = [],
    modelCacheWork = null,
    modelCacheProgress = '',
    modelCacheError = '',
    animatedWidth = promptState?.promptWidth ?? 0,
    abortController = null,
    promptScope = 'file',
    runningSessionId = null,
  } = promptUiState || {};

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
  const sidebarState = SidebarState.useState();
  const { showAIInput } = sidebarState;
  const tabState = TabState.useState();
  const editorState = EditorState.useState();
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

  const handleStop = (e) => {
    e.preventDefault();
    abortController?.abort();
    import('@/components/AI/WebLLMAPI').then(({ interruptWebLLM }) => {
      interruptWebLLM();
    });
    const sessionId = runningSessionId || agentSessionState?.activeSessionId;
    if (sessionId) {
      patchSession(sessionId, { status: 'idle', reasoning: '' });
      pushSessionMessage(
        sessionId,
        createSessionMessage({ role: 'system', text: 'AI generation stopped by user.' }),
      );
    }
    promptUiState((draft) => {
      draft.runningSessionId = null;
      draft.abortController = null;
    });
    logState((draft) => {
      draft.isAIProcessing = false;
      draft.reasoning = '';
      draft.logs = [
        ...draft.logs,
        {
          id: Date.now(),
          role: 'system',
          text: 'AI generation stopped by user.',
          timestamp: new Date().toTimeString().split(' ')[0],
        },
      ];
    });
  };

  const send = (e) => {
    e.preventDefault();
    if (!val.trim() || isAIProcessing || !activeSession) return;

    const userMsg = val;
    const sessionId = activeSession.id;
    const sessionMode = activeSession.mode === 'team' ? 'team' : 'single';
    addToHistory(userMsg);

    const currentActiveTabId = tabState.activeTabId;
    const currentActiveTab = tabState.openTabs.find((t) => t.id === currentActiveTabId);

    pushSessionMessage(sessionId, createSessionMessage({ role: 'user', text: userMsg }));
    patchSession(sessionId, { status: 'running', reasoning: '' });
    promptUiState((draft) => {
      draft.val = '';
      draft.draftVal = '';
      draft.historyIndex = -1;
      draft.runningSessionId = sessionId;
    });

    logState((draft) => {
      draft.isAIProcessing = true;
      draft.reasoning = '';
      draft.logs = [
        ...draft.logs,
        {
          id: Date.now(),
          role: 'system',
          text: `[${activeSession.name}] started (${sessionMode}).`,
          timestamp: new Date().toTimeString().split(' ')[0],
        },
      ];
    });

    const runAI = async () => {
      try {
        console.info('[Prompt] Starting AI request for:', userMsg);
        const selectedLines = editorState.selectedLines?.[currentActiveTabId] || [];
        const controller = new AbortController();
        promptUiState((draft) => {
          draft.abortController = controller;
        });
        const events = [];
        const [
          { collectWorkspaceFiles, runAgent, runCollaborativeAgent, applyAgentChanges },
          { Compiler },
        ] = await Promise.all([import('@/components/AI/Agent'), import('@/utils/compiler')]);
        const workspaceFiles = await collectWorkspaceFiles(fs, editorState.fileContents || {});
        const runOptions = {
          request: userMsg,
          scope: promptScope,
          activeFile:
            promptScope === 'file' && currentActiveTab?.type === 'file'
              ? currentActiveTabId
              : undefined,
          selectedLines: promptScope === 'file' ? selectedLines : [],
          files: workspaceFiles,
          model: selectedModel,
          signal: controller.signal,
          retrieveContext: async (query, k) => {
            const { ragSearch } = await import('@/utils/rag/search-utility');
            return ragSearch.retrieveContext(query, k);
          },
          validate: async (stagedFiles) => {
            const validationLogs = [];
            const compiler = new Compiler((line) => validationLogs.push(line));
            try {
              await compiler.compile(fs, sidebarState.folderTree || [], stagedFiles);
              return `Validation passed.\n${validationLogs.slice(-12).join('\n')}`;
            } catch (error) {
              return `Validation failed: ${error.message}\n${validationLogs.slice(-20).join('\n')}`;
            }
          },
          onEvent: (event) => {
            const line = formatAgentEvent(event);
            if (line) events.push(line);
            const reasoning = events.slice(-30).join('\n\n');
            patchSession(sessionId, { reasoning });
            logState((draft) => {
              draft.reasoning = reasoning;
            });
          },
        };

        const result =
          sessionMode === 'team'
            ? await runCollaborativeAgent(runOptions)
            : await runAgent(runOptions);

        let stillProcessing = false;
        logState((draft) => {
          stillProcessing = draft.isAIProcessing;
        });
        if (!stillProcessing) return;

        const summaryText = `[Local agent${sessionMode === 'team' ? ' team' : ''}]: ${
          result.summary || `Prepared ${result.changes.length} file(s) for review.`
        }`;
        pushSessionMessage(
          sessionId,
          createSessionMessage({
            role: 'ai',
            text: summaryText,
            agentRole: sessionMode === 'team' ? 'reviewer' : null,
          }),
        );
        patchSession(sessionId, { status: 'idle' });
        promptUiState((draft) => {
          draft.runningSessionId = null;
          draft.abortController = null;
        });
        logState((draft) => {
          draft.logs = [
            ...draft.logs,
            {
              id: Date.now() + 1,
              role: 'ai',
              text: summaryText,
              timestamp: new Date().toTimeString().split(' ')[0],
            },
          ];
          draft.isAIProcessing = false;
        });

        const { deletions } = applyAgentChanges(result.changes, {
          editorState,
          sidebarState,
          logState,
        });
        if (deletions.length > 0) {
          editorState((draft) => {
            const next = { ...(draft.pendingDeletions || {}) };
            for (const { path, before } of deletions) {
              next[path] = { originalContent: before };
            }
            draft.pendingDeletions = next;
          });
          const deletionText = `Deletion review pending for ${deletions.map(({ path }) => path).join(', ')}. Approve or undo in the editor.`;
          pushSessionMessage(
            sessionId,
            createSessionMessage({ role: 'system', text: deletionText }),
          );
          logState((draft) => {
            draft.logs = [
              ...draft.logs,
              {
                id: Date.now() + 6,
                role: 'system',
                text: deletionText,
                timestamp: new Date().toTimeString().split(' ')[0],
              },
            ];
          });
        }
      } catch (err) {
        const message = `Agent error: ${err.message || err}`;
        logState((draft) => {
          if (!draft.isAIProcessing) return;
          draft.logs = [
            ...draft.logs,
            {
              id: Date.now(),
              role: 'ai',
              text: message,
              timestamp: new Date().toTimeString().split(' ')[0],
            },
          ];
          draft.isAIProcessing = false;
        });
        pushSessionMessage(sessionId, createSessionMessage({ role: 'ai', text: message }));
        patchSession(sessionId, { status: 'error' });
        promptUiState((draft) => {
          draft.runningSessionId = null;
          draft.abortController = null;
        });
      }
    };

    runAI();
  };

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
    const timer = window.setTimeout(() => Settings.setPromptDraft(val), 250);
    return () => window.clearTimeout(timer);
  }, [val]);

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
      window.alert(error.message);
    }
  };

  const handleRenameSession = () => {
    if (!activeSession) return;
    const nextName = window.prompt('Rename session', activeSession.name);
    if (nextName == null) return;
    agentSessionState((draft) => {
      const next = renameAgentSession(
        { sessions: draft.sessions, activeSessionId: draft.activeSessionId },
        activeSession.id,
        nextName,
      );
      draft.sessions = next.sessions;
    });
  };

  const handleDeleteSession = () => {
    if (!activeSession) return;
    if (activeSession.messages?.length) {
      const ok = window.confirm(`Delete session "${activeSession.name}"?`);
      if (!ok) return;
    }
    if (runningSessionId === activeSession.id && isAIProcessing) {
      window.alert('Stop the running agent before deleting this session.');
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
          styles={styles}
        />
        <ReasoningPanel styles={styles} />
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
          onChangeModel={(nextModel) =>
            promptUiState((draft) => {
              draft.selectedModel = nextModel;
              Settings.setAIPromptModel(nextModel);
            })
          }
          onLoadCachedModelIds={loadCachedModelIds}
          onOpenModelManager={openModelManager}
        />
      </div>
    </aside>
  );
}
