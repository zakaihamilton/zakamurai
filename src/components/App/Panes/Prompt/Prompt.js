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

const formatAgentEvent = (event) => {
  if (event.type === 'thinking') return `**Step ${event.turn}:** planning next action…`;
  if (event.type === 'tool') {
    const target = event.action.path || event.action.query || '';
    return `**Step ${event.turn}:** \`${event.action.action}\`${target ? ` — ${target}` : ''}`;
  }
  if (event.type === 'observation') return event.error ? `⚠ ${event.message}` : event.message;
  if (event.type === 'finished')
    return `**Ready for review:** ${event.message || 'Agent finished.'}`;
  return '';
};
import useModelDownloader from './ModelDownloader';
import styles from './Prompt.module.css';
import usePromptHistory from './PromptHistory';
import ModelDownloader from './subcomponents/ModelManager';
import PromptComposer from './subcomponents/PromptComposer';
import PromptContextPanel from './subcomponents/PromptContextPanel';
import PromptHeader from './subcomponents/PromptHeader';
import ReasoningPanel from './subcomponents/ReasoningPanel';

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

  const { loadCachedModelIds, openModelManager, closeModelManager, handleModelCacheAction } =
    useModelDownloader(promptUiState);

  const { handleArrowUp, handleArrowDown, addToHistory } = usePromptHistory(
    val,
    historyIndex,
    draftVal,
    promptUiState,
  );

  const handleStop = (e) => {
    e.preventDefault();
    abortController?.abort();
    import('@/components/AI/WebLLMAPI').then(({ interruptWebLLM }) => {
      interruptWebLLM();
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
    if (!val.trim() || isAIProcessing) return;

    const userMsg = val;
    addToHistory(userMsg);

    const currentActiveTabId = tabState.activeTabId;
    const currentActiveTab = tabState.openTabs.find((t) => t.id === currentActiveTabId);
    // Log only the short user message to the UI
    logState((draft) => {
      draft.logs = [
        ...draft.logs,
        {
          id: Date.now(),
          role: 'user',
          text: userMsg,
          timestamp: new Date().toTimeString().split(' ')[0],
        },
      ];
      draft.isAIProcessing = true;
      draft.reasoning = '';
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
        // Lazy-load agent + compiler only on first ask (keeps WebLLM/almostnode off first paint).
        const [{ collectWorkspaceFiles, runAgent, applyAgentChanges }, { Compiler }] =
          await Promise.all([import('@/components/AI/Agent'), import('@/utils/compiler')]);
        const workspaceFiles = await collectWorkspaceFiles(fs, editorState.fileContents || {});
        const result = await runAgent({
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
            logState((draft) => {
              draft.reasoning = events.slice(-30).join('\n\n');
            });
          },
        });

        let stillProcessing = false;
        logState((draft) => {
          stillProcessing = draft.isAIProcessing;
        });
        if (!stillProcessing) return;

        logState((draft) => {
          draft.logs = [
            ...draft.logs,
            {
              id: Date.now() + 1,
              role: 'ai',
              text: `[Local agent]: ${result.summary || `Prepared ${result.changes.length} file(s) for review.`}`,
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
          logState((draft) => {
            draft.logs = [
              ...draft.logs,
              {
                id: Date.now() + 6,
                role: 'system',
                text: `Deletion review pending for ${deletions.map(({ path }) => path).join(', ')}. Approve or undo in the editor.`,
                timestamp: new Date().toTimeString().split(' ')[0],
              },
            ];
          });
        }
      } catch (err) {
        logState((draft) => {
          if (!draft.isAIProcessing) return; // Discard if stopped
          draft.logs = [
            ...draft.logs,
            {
              id: Date.now(),
              role: 'ai',
              text: `Agent error: ${err.message || err}`,
              timestamp: new Date().toTimeString().split(' ')[0],
            },
          ];
          draft.isAIProcessing = false;
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
        // Explicitly add a newline for Cmd+Enter or Ctrl+Enter
        e.preventDefault();
        e.stopPropagation();
        const { selectionStart, selectionEnd, value } = e.target;
        const newValue = `${value.substring(0, selectionStart)}\n${value.substring(selectionEnd)}`;
        promptUiState((draft) => {
          draft.val = newValue;
        });

        // Use requestAnimationFrame or setTimeout to restore cursor position after React render
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
          hasReasoning={Boolean(logState.reasoning)}
          isReasoningVisible={isReasoningVisible}
          onToggleReasoning={() =>
            promptUiState((draft) => {
              draft.isReasoningVisible = !draft.isReasoningVisible;
            })
          }
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
