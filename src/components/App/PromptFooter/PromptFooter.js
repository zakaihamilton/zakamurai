import React, { useState } from 'react';
import { askWebLLM, interruptWebLLM, processAIResponse } from '../../AI';
import Settings from '../../Storage/Settings';
import { AppState } from '../App';
import { EditorState } from '../EditorArea';
import { Icons } from '../Icons';
import { LogState } from '../LogArea';
import { SidebarState } from '../Sidebar';
import { TabState } from '../TabBar';
import styles from './PromptFooter.module.css';

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
      draft.processingType = null;
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
      draft.processingType = 'ai';
    });

    const runAI = async () => {
      try {
        const systemInstructions = `You are an expert developer.
When updating files, follow these rules:
1. Prefer SEARCH/REPLACE blocks for small changes.
2. ONLY use full file content for new files or complete rewrites.
3. Use the EXACT file path provided in the context. Do not add prefixes like "path/to/" or "./".
4. Do NOT include comments like "// CHANGE ..." or "// REPLACE ..." inside the code blocks. The code you provide must be valid and ready to run.
5. If you use full content, you MUST NOT omit any existing code unless explicitly asked to delete it.

SEARCH/REPLACE Example:
// --- File: path/to/file ---
<<<<<<< SEARCH
[exact code to find]
=======
[new code to replace it with]
>>>>>>> REPLACE
// --- End File ---
6. Be EXTREMELY precise with CSS properties. If the user says "change the color", assume they mean the 'color' property (text color) unless they specify 'background' or it's obvious from context. Do not confuse 'color' with 'background-color'.`;

        let finalPrompt;
        const selectedLines = editorState.selectedLines?.[currentActiveTabId] || [];
        const selectionInfo =
          selectedLines.length > 0
            ? `\n\nCRITICAL: The user has selected the following lines for review: ${selectedLines.join(
                ', ',
              )}. ONLY apply changes to these specific lines.`
            : '';

        // Inject the active file context if available
        if (
          currentActiveTab &&
          currentActiveTab.type === 'file' &&
          activeFileContent !== undefined
        ) {
          finalPrompt = `${systemInstructions}\n\nHere is the current file I am working on (${currentActiveTabId}):\n\n${activeFileContent}${selectionInfo}\n\nUser Request:\n${userMsg}`;
        } else {
          finalPrompt = `${systemInstructions}\n\nUser Request:\n${userMsg}`;
        }

        const webLLMResult = await askWebLLM(finalPrompt);

        // Check if we're still processing (user might have clicked stop)
        // If isProcessing is false now, we discard the result
        let stillProcessing = false;
        logState((draft) => {
          stillProcessing = draft.isProcessing;
        });
        if (!stillProcessing) return;

        logState((draft) => {
          draft.logs = [
            ...draft.logs,
            { id: Date.now() + 1, role: 'ai', text: `[Browser WebLLM]: ${webLLMResult}` },
          ];
          draft.isProcessing = false;
          draft.processingType = null;
        });

        // Use the centralized processor to apply file changes
        await processAIResponse(webLLMResult, fs, logState, sidebarState, editorState, tabState);
      } catch (err) {
        logState((draft) => {
          if (!draft.isProcessing) return; // Discard if stopped
          draft.logs = [
            ...draft.logs,
            {
              id: Date.now(),
              role: 'ai',
              text: `Error processing AI prompt: ${err.message || err}`,
            },
          ];
          draft.isProcessing = false;
          draft.processingType = null;
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

  const currentActiveTabId = tabState.activeTabId;
  const selectedLines = editorState.selectedLines?.[currentActiveTabId] || [];

  return (
    <div className={styles.promptFooter}>
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
          placeholder={
            isProcessing ? 'AI is working... Please wait.' : 'Enter the AI prompt here...'
          }
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
