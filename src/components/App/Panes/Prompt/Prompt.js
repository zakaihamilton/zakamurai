import { processAIResponse } from '@/components/AI/Processor';
import { DEFAULT_SYSTEM_PROMPT, buildEditPrompt } from '@/components/AI/Prompts';
import { RECOMMENDED_WEB_LLM_MODEL, WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { Icons } from '@/components/Core/Base/Icons';
import { createState } from '@/components/Core/Base/State';
import Settings from '@/components/Storage/Settings';
import Select from '@/components/Widgets/Select';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { formatShortcut } from '@/utils/os';
import React, { useEffect, useRef, useState } from 'react';
import styles from './Prompt.module.css';
import ModelManager from './subcomponents/ModelManager';
import ReasoningPanel from './subcomponents/ReasoningPanel';

export const PromptState = createState('PromptState');
const PromptUiState = createState('PromptUiState');
const getInitialSelectedModel = () =>
  Settings.getAIPromptModel(RECOMMENDED_WEB_LLM_MODEL.id) || RECOMMENDED_WEB_LLM_MODEL.id;

export default function Prompt() {
  const { fs, isMobile } = AppState.useState(['fs', 'isMobile']);
  const promptUiState = PromptUiState.useState(null, {
    val: '',
    historyIndex: -1,
    draftVal: '',
    isReasoningVisible: true,
    selectedModel: getInitialSelectedModel(),
    isModelManagerOpen: false,
  });
  const {
    val = '',
    historyIndex = -1,
    draftVal = '',
    isReasoningVisible = true,
    selectedModel = RECOMMENDED_WEB_LLM_MODEL.id,
    isModelManagerOpen = false,
  } = promptUiState || {};
  const [cachedModelIds, setCachedModelIds] = React.useState([]);
  const [modelCacheWork, setModelCacheWork] = React.useState(null);
  const [modelCacheProgress, setModelCacheProgress] = React.useState('');
  const [modelCacheError, setModelCacheError] = React.useState('');
  const hasLoadedModelCacheRef = useRef(false);

  const logState = LogState.usePassiveState();
  const { isSystemProcessing, isAIProcessing } = LogState.useState([
    'isSystemProcessing',
    'isAIProcessing',
  ]);
  const sidebarState = SidebarState.useState();
  const { showAIInput } = sidebarState;
  const tabState = TabState.useState();
  const editorState = EditorState.useState();
  const promptState = PromptState.useState();
  const { promptWidth } = promptState;

  const loadCachedModelIds = () => {
    if (hasLoadedModelCacheRef.current) return;
    hasLoadedModelCacheRef.current = true;

    refreshCachedModelIds();
  };

  const refreshCachedModelIds = () => {
    return import('@/components/AI/WebLLMAPI')
      .then(({ getCachedWebLLMModelIds }) => getCachedWebLLMModelIds())
      .then(setCachedModelIds)
      .catch((error) => {
        hasLoadedModelCacheRef.current = false;
        console.warn('[Prompt] Failed to load cached model metadata:', error);
      });
  };

  const openModelManager = () => {
    promptUiState((draft) => {
      draft.isModelManagerOpen = true;
    });
    loadCachedModelIds();
  };

  const closeModelManager = () => {
    promptUiState((draft) => {
      draft.isModelManagerOpen = false;
    });
    setModelCacheError('');
    setModelCacheProgress('');
  };

  const handleModelCacheAction = async (model, action) => {
    const key = `${action}:${model.id}`;
    setModelCacheWork(key);
    setModelCacheError('');
    setModelCacheProgress(action === 'cache' ? 'Preparing download...' : 'Removing cache...');

    try {
      if (action === 'cache') {
        const { cacheWebLLMModel } = await import('@/components/AI/WebLLMAPI');
        await cacheWebLLMModel(model.id, setModelCacheProgress);
      } else {
        const { deleteCachedWebLLMModel } = await import('@/components/AI/WebLLMAPI');
        await deleteCachedWebLLMModel(model.id);
      }
      hasLoadedModelCacheRef.current = true;
      await refreshCachedModelIds();
      setModelCacheProgress(action === 'cache' ? 'Cached and ready.' : 'Cache removed.');
    } catch (error) {
      setModelCacheError(error.message || String(error));
    } finally {
      setModelCacheWork(null);
    }
  };

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
    promptUiState((draft) => {
      draft.val = '';
      draft.historyIndex = -1;
      draft.draftVal = '';
    });
    Settings.addPromptHistory(userMsg);

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
      const history = Settings.getPromptHistory();
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        promptUiState((draft) => {
          if (historyIndex === -1) {
            draft.draftVal = val;
          }
          draft.historyIndex = newIndex;
          draft.val = history[newIndex];
        });
      }
    } else if (e.key === 'ArrowDown') {
      const history = Settings.getPromptHistory();
      if (historyIndex > -1) {
        const newIndex = historyIndex - 1;
        promptUiState((draft) => {
          draft.historyIndex = newIndex;
          draft.val = newIndex === -1 ? draftVal : history[newIndex];
        });
      }
    }
  };

  const isBtnActive = val.trim() && !isAIProcessing;

  const currentActiveTabId = tabState.activeTabId;
  const selectedLines = editorState.selectedLines?.[currentActiveTabId] || [];
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
  const [animatedWidth, setAnimatedWidth] = useState(isOpen ? promptWidth : 0);

  useEffect(() => {
    if (isMobile) return undefined;

    if (isOpen) {
      const frame = window.requestAnimationFrame(() => setAnimatedWidth(promptWidth));
      return () => window.cancelAnimationFrame(frame);
    }

    setAnimatedWidth(promptWidth);
    const frame = window.requestAnimationFrame(() => setAnimatedWidth(0));
    return () => window.cancelAnimationFrame(frame);
  }, [isMobile, isOpen, promptWidth]);

  const desktopWidth = `${animatedWidth}px`;

  return (
    <aside
      className={`${styles.prompt} ${isOpen ? '' : styles.closed}`}
      aria-hidden={!isOpen}
      style={{
        width: isMobile ? undefined : desktopWidth,
        flexBasis: isMobile ? undefined : desktopWidth,
      }}
    >
      <div className={styles.content}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>AI Prompt</h2>
          </div>
          <div className={styles.headerActions}>
            {isAIProcessing && <span className={styles.status}>AI Working</span>}
            {isSystemProcessing && <span className={styles.status}>Compiling</span>}
            {logState.reasoning && (
              <Tooltip content={isReasoningVisible ? 'Hide Reasoning' : 'Show Reasoning'}>
                <button
                  type="button"
                  className={`${styles.headerActionBtn} ${
                    isReasoningVisible ? styles.headerActionBtnActive : ''
                  }`}
                  onClick={() =>
                    promptUiState((draft) => {
                      draft.isReasoningVisible = !draft.isReasoningVisible;
                    })
                  }
                >
                  <Icons.Brain />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
        {(currentActiveTabId || selectedLines.length > 0) && (
          <div className={styles.tagsContainer}>
            {currentActiveTabId && (
              <div className={styles.tag}>
                <Icons.File size={12} />
                <span>{currentActiveTabId.split('/').pop()}</span>
              </div>
            )}
            {selectedLines.length > 0 && (
              <div className={styles.tag}>
                <Icons.Check size={12} />
                <span>Lines: {selectedLines.sort((a, b) => a - b).join(', ')}</span>
              </div>
            )}
          </div>
        )}
        <div
          className={styles.modelPanel}
          onFocusCapture={loadCachedModelIds}
          onPointerDown={loadCachedModelIds}
        >
          <div className={styles.modelControlRow}>
            <Select
              id="ai-model-select"
              label="Model"
              value={selectedModelInfo.id}
              options={modelOptions}
              onChange={(nextModel) =>
                promptUiState((draft) => {
                  draft.selectedModel = nextModel;
                  Settings.setAIPromptModel(nextModel);
                })
              }
              disabled={isAIProcessing || !isOpen}
              tabIndex={isOpen ? undefined : -1}
              className={styles.modelSelect}
            />
            <Tooltip content="Manage AI models">
              <button
                type="button"
                className={styles.modelManagerButton}
                onClick={openModelManager}
                disabled={!isOpen}
                aria-label="Manage AI models"
                tabIndex={isOpen ? undefined : -1}
              >
                <Icons.Info size={16} />
              </button>
            </Tooltip>
          </div>
        </div>
        <ModelManager
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
        <ReasoningPanel
          reasoning={logState.reasoning}
          isReasoningVisible={isReasoningVisible}
          styles={styles}
        />
        <form onSubmit={send} className={styles.form}>
          <textarea
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
            disabled={isAIProcessing || !isOpen}
            placeholder={
              isAIProcessing ? 'AI is working... Please wait.' : 'Enter the AI prompt here...'
            }
            className={styles.input}
            tabIndex={isOpen ? undefined : -1}
          />
          <div className={styles.actions}>
            {isAIProcessing && (
              <Tooltip content="Stop AI" shortcut={formatShortcut('⌘.')}>
                <button
                  type="button"
                  onClick={handleStop}
                  className={`${styles.button} ${styles.stopButton}`}
                  tabIndex={isOpen ? undefined : -1}
                >
                  <Icons.Close />
                </button>
              </Tooltip>
            )}
            <Tooltip content="Execute prompt" shortcut="↵">
              <button
                type="submit"
                disabled={!isBtnActive || !isOpen}
                className={`${styles.button} ${isBtnActive ? styles.buttonActive : styles.buttonDisabled}`}
                tabIndex={isOpen ? undefined : -1}
              >
                <Icons.Send />
              </button>
            </Tooltip>
          </div>
        </form>
      </div>
    </aside>
  );
}
