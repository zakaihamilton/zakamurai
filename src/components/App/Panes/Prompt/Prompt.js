import { processAIResponse } from '@/components/AI/Processor';
import { DEFAULT_SYSTEM_PROMPT, buildEditPrompt } from '@/components/AI/Prompts';
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
import useModelDownloader from './ModelDownloader';
import styles from './Prompt.module.css';
import usePromptHistory from './PromptHistory';
import ModelDownloader from './subcomponents/ModelManager';
import PromptComposer from './subcomponents/PromptComposer';
import PromptContextPanel from './subcomponents/PromptContextPanel';
import PromptHeader from './subcomponents/PromptHeader';
import PromptModelPanel from './subcomponents/PromptModelPanel';
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
    val: '',
    historyIndex: -1,
    draftVal: '',
    isReasoningVisible: true,
    selectedModel: getInitialSelectedModel(),
    isModelManagerOpen: false,
    cachedModelIds: [],
    modelCacheWork: null,
    modelCacheProgress: '',
    modelCacheError: '',
    animatedWidth: promptState?.promptWidth ?? 0,
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
    let activeFileContent = undefined;
    if (currentActiveTab && currentActiveTab.type === 'file') {
      activeFileContent = editorState.fileContents?.[currentActiveTabId];
    }

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
        let ragResults = [];

        // 1. Retrieve RAG context
        try {
          console.info('[Prompt] Retrieving RAG context...');
          const { ragSearch } = await import('@/utils/rag/search-utility');
          ragResults = await ragSearch.retrieveContext(userMsg, 3);
          console.info('[Prompt] RAG context retrieved:', ragResults.length, 'items');
        } catch (ragErr) {
          console.error('[Prompt] RAG retrieval failed:', ragErr);
        }

        const selectedLines = editorState.selectedLines?.[currentActiveTabId] || [];
        const finalPrompt = buildEditPrompt({
          userRequest: userMsg,
          activeFilePath: currentActiveTab?.type === 'file' ? currentActiveTabId : undefined,
          activeFileContent,
          selectedLines,
          relatedContext: ragResults,
        });

        console.info('[Prompt] Calling askWebLLM...');
        const { askWebLLM } = await import('@/components/AI/WebLLMAPI');
        const webLLMResult = await askWebLLM(
          finalPrompt,
          DEFAULT_SYSTEM_PROMPT,
          (partial) => {
            logState((draft) => {
              draft.reasoning = partial;
            });
          },
          { temperature: 0.2, top_p: 0.8, model: selectedModel },
        );

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
              text: `[Browser WebLLM]: ${webLLMResult}`,
              timestamp: new Date().toTimeString().split(' ')[0],
            },
          ];
          draft.isAIProcessing = false;
        });

        // Use the centralized processor to apply file changes
        await processAIResponse(webLLMResult, fs, logState, sidebarState, editorState, tabState);
      } catch (err) {
        logState((draft) => {
          if (!draft.isAIProcessing) return; // Discard if stopped
          draft.logs = [
            ...draft.logs,
            {
              id: Date.now(),
              role: 'ai',
              text: `Error processing AI prompt: ${err.message || err}`,
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
          activeFileName={activeFileName}
          activeFilePath={activeFilePath}
          selectedLines={selectedLines}
          selectedLineText={selectedLineText}
          runState={runState}
        />
        <PromptModelPanel
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
          isAIProcessing={isAIProcessing}
          isOpen={isOpen}
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
        />
      </div>
    </aside>
  );
}
