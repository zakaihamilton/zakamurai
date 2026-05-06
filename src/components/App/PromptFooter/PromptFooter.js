import React, { useState } from 'react';
import { LogState } from '../LogArea';
import { SidebarState } from '../Sidebar';
import { TabState } from '../TabBar';
import { EditorState } from '../EditorArea';
import styles from './PromptFooter.module.css';
import { askWebLLM, interruptWebLLM, processAIResponse } from '../../AI';
import Settings from '../../Storage/Settings';
import { AppState } from '../App';
import { Icons } from '../Icons';

export default function PromptFooter() {
  const { fs } = AppState.useState();
  const [val, setVal] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draftVal, setDraftVal] = useState('');

  const logState = LogState.useState();
  const { isProcessing } = logState;
  const sidebarState = SidebarState.useState();
  const { showAIInput } = sidebarState;
  const tabState = TabState.useState();
  const editorState = EditorState.useState();

  if (!showAIInput) return null;

  const handleStop = (e) => {
    e.preventDefault();
    interruptWebLLM();
    logState((draft) => {
      draft.isProcessing = false;
      draft.logs = [
        ...draft.logs,
        { id: Date.now(), role: 'system', text: 'AI generation stopped by user.' },
      ];
    });
  };

  const send = (e) => {
    e.preventDefault();
    if (!val.trim() || isProcessing) return;

    const userMsg = val;
    setVal('');
    setHistoryIndex(-1);
    setDraftVal('');
    Settings.addPromptHistory(userMsg);

    const currentActiveTabId = tabState.activeTabId;
    const currentActiveTab = tabState.openTabs.find((t) => t.id === currentActiveTabId);
    let activeFileContent = undefined;
    if (currentActiveTab && currentActiveTab.type === 'file') {
      activeFileContent = editorState.fileContents?.[currentActiveTabId];
    }

    // Log only the short user message to the UI
    logState((draft) => {
      draft.logs = [...draft.logs, { id: Date.now(), role: 'user', text: userMsg }];
      draft.isProcessing = true;
    });
    tabState((draft) => {
      draft.activeTabId = 'ai-logs';
    });

    const runAI = async () => {
      try {
        let finalPrompt = userMsg;

        // Inject the active file context if available
        if (currentActiveTab && currentActiveTab.type === 'file' && activeFileContent !== undefined) {
          finalPrompt = `You are an expert developer. Here is the current file I am working on (${currentActiveTabId}):\n\n${activeFileContent}\n\nUser Request:\n${userMsg}`;
        }

        const webLLMResult = await askWebLLM(finalPrompt);

        // Check if we're still processing (user might have clicked stop)
        // If isProcessing is false now, we discard the result
        let stillProcessing = false;
        logState((draft) => { stillProcessing = draft.isProcessing; });
        if (!stillProcessing) return;

        logState((draft) => {
          draft.logs = [
            ...draft.logs,
            { id: Date.now() + 1, role: 'ai', text: `[Browser WebLLM]: ${webLLMResult}` },
          ];
          draft.isProcessing = false;
        });

        // Use the centralized processor to apply file changes
        await processAIResponse(webLLMResult, fs, logState, sidebarState, editorState);
      } catch (err) {
        logState((draft) => {
          if (!draft.isProcessing) return; // Discard if stopped
          draft.logs = [
            ...draft.logs,
            { id: Date.now(), role: 'ai', text: `Error processing AI prompt: ${err.message || err}` },
          ];
          draft.isProcessing = false;
        });
      }
    };

    runAI();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      const history = Settings.getPromptHistory();
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        if (historyIndex === -1) {
          setDraftVal(val);
        }
        setHistoryIndex(newIndex);
        setVal(history[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      const history = Settings.getPromptHistory();
      if (historyIndex > -1) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setVal(newIndex === -1 ? draftVal : history[newIndex]);
      }
    }
  };

  const isBtnActive = val.trim() && !isProcessing;

  return (
    <div className={styles.promptFooter}>
      <form onSubmit={send} className={styles.form}>
        <input
          value={val}
          onChange={(e) => {
            setVal(e.target.value);
            if (historyIndex === -1) {
              setDraftVal(e.target.value);
            }
          }}
          onKeyDown={handleKeyDown}
          disabled={isProcessing}
          placeholder={isProcessing ? 'AI is working... Please wait.' : 'Enter the AI prompt here...'}
          className={styles.input}
        />
        {isProcessing && (
          <button
            type="button"
            onClick={handleStop}
            className={styles.button}
            style={{ color: 'var(--error, #f44336)' }}
            title="Stop AI"
          >
            <Icons.Close />
          </button>
        )}
        <button
          type="submit"
          disabled={!isBtnActive}
          className={`${styles.button} ${isBtnActive ? styles.buttonActive : styles.buttonDisabled}`}
          title="Execute"
        >
          <Icons.Send />
        </button>
      </form>
    </div>
  );
}
