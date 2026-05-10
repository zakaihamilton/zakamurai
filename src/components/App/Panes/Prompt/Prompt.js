import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { Icons } from '@/components/Core/Base/Icons';
import { createState } from '@/components/Core/Base/State';
import Settings from '@/components/Storage/Settings';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { formatShortcut } from '@/utils/os';
import React, { useEffect, useRef, useState } from 'react';
import { askWebLLM, interruptWebLLM, processAIResponse } from '@/components/AI';
import styles from './Prompt.module.css';

export const PromptState = createState('PromptState');

export default function Prompt() {
  const { fs } = AppState.useState();
  const [val, setVal] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draftVal, setDraftVal] = useState('');
  const reasoningRef = useRef(null);

  const logState = LogState.useState();
  const { isProcessing, processingType, reasoning } = logState;
  const sidebarState = SidebarState.useState();
  const { showAIInput } = sidebarState;
  const tabState = TabState.useState();
  const editorState = EditorState.useState();
  const promptState = PromptState.useState();
  const { promptWidth } = promptState;

  useEffect(() => {
    if (reasoning && reasoningRef.current) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight;
    }
  }, [reasoning]);

  const handleStop = (e) => {
    e.preventDefault();
    interruptWebLLM();
    logState((draft) => {
      draft.isProcessing = false;
      draft.processingType = null;
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
      draft.logs = [
        ...draft.logs,
        {
          id: Date.now(),
          role: 'user',
          text: userMsg,
          timestamp: new Date().toTimeString().split(' ')[0],
        },
      ];
      draft.isProcessing = true;
      draft.processingType = 'ai';
      draft.reasoning = '';
    });

    const runAI = async () => {
      try {
        const systemPrompt = `You are an expert developer assistant.
Think step-by-step and provide clear reasoning before outputting any code modifications.

When updating files, you MUST use the following exact formats. Do NOT use markdown codeblocks (like \`\`\`) around the file blocks.

Rule 1: Prefer SEARCH/REPLACE blocks for small, targeted changes. This is the SAFEST way to update files.
Rule 2: ONLY use full file content for new files or complete rewrites. 
Rule 3: Use the EXACT file path provided in the context. Do not add prefixes like "path/to/" or "./".
Rule 4: Do NOT include summary comments like "// CHANGE ..." or "// REPLACE ...". The code you provide must be valid and ready to run.
Rule 5: CRITICAL: If you use the full code content format, you MUST include the ENTIRE file from start to finish. Any code omitted WILL BE DELETED.
Rule 6: Be EXTREMELY precise with CSS properties (e.g., 'color' vs 'background-color').

EXAMPLE OF TARGETED CHANGE (SEARCH/REPLACE):
// --- File: src/style.css ---
<<<<<<< SEARCH
.btn {
  color: red;
}
=======
.btn {
  color: blue;
}
>>>>>>> REPLACE
// --- End File ---

EXAMPLE OF NEW FILE (FULL REWRITE):
// --- File: src/new.js ---
console.log("Hello World");
// --- End File ---

FORMAT FOR SEARCH/REPLACE (STRICTLY PREFERRED):
// --- File: exact/file/path.js ---
<<<<<<< SEARCH
[exact code to find, including whitespace]
=======
[new code to replace it with]
>>>>>>> REPLACE
// --- End File ---

FORMAT FOR FULL FILE REWRITE (ONLY FOR NEW FILES OR COMPLETE OVERHAULS):
// --- File: exact/file/path.js ---
[ENTIRE full code content - do NOT omit anything]
// --- End File ---`;

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
          finalPrompt = `Here is the current file I am working on (${currentActiveTabId}):\n\n${activeFileContent}${selectionInfo}\n\nUser Request:\n${userMsg}`;
        } else {
          finalPrompt = `User Request:\n${userMsg}`;
        }

        const webLLMResult = await askWebLLM(finalPrompt, systemPrompt, (partial) => {
          logState((draft) => {
            draft.reasoning = partial;
          });
        });

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
            {
              id: Date.now() + 1,
              role: 'ai',
              text: `[Browser WebLLM]: ${webLLMResult}`,
              timestamp: new Date().toTimeString().split(' ')[0],
            },
          ];
          draft.isProcessing = false;
          draft.processingType = null;
          draft.reasoning = '';
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
              timestamp: new Date().toTimeString().split(' ')[0],
            },
          ];
          draft.isProcessing = false;
          draft.processingType = null;
          draft.reasoning = '';
        });
      }
    };

    runAI();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.metaKey || e.ctrlKey) {
        // Explicitly add a newline for Cmd+Enter or Ctrl+Enter
        e.preventDefault();
        e.stopPropagation();
        const { selectionStart, selectionEnd, value } = e.target;
        const newValue = `${value.substring(0, selectionStart)}\n${value.substring(selectionEnd)}`;
        setVal(newValue);

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
    <aside
      className={`${styles.prompt} ${showAIInput ? styles.open : styles.closed}`}
      aria-hidden={!showAIInput}
      style={{
        width: showAIInput ? `${promptWidth}px` : '0px',
      }}
    >
      <div className={styles.content}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>AI Prompt</h2>
          </div>
          {isProcessing && (
            <span className={styles.status}>
              {processingType === 'ai' ? 'Working' : 'Compiling'}
            </span>
          )}
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
        {isProcessing && logState.reasoning && (
          <div className={styles.reasoningContainer}>
            <div className={styles.reasoningHeader}>
              <Icons.Info size={14} />
              <span>Progress & Reasoning</span>
            </div>
            <div ref={reasoningRef} className={`${styles.reasoningContent} scroll-hide`}>
              {logState.reasoning}
            </div>
          </div>
        )}
        <form onSubmit={send} className={styles.form}>
          <textarea
            value={val}
            onChange={(e) => {
              setVal(e.target.value);
              if (historyIndex === -1) {
                setDraftVal(e.target.value);
              }
            }}
            onKeyDown={handleKeyDown}
            disabled={isProcessing || !showAIInput}
            placeholder={
              isProcessing
                ? processingType === 'ai'
                  ? 'AI is working... Please wait.'
                  : 'Compiling... Please wait.'
                : 'Enter the AI prompt here...'
            }
            className={styles.input}
            tabIndex={showAIInput ? undefined : -1}
          />
          <div className={styles.actions}>
            {isProcessing && processingType === 'ai' && (
              <Tooltip content="Stop AI" shortcut={formatShortcut('⌘.')}>
                <button
                  type="button"
                  onClick={handleStop}
                  className={`${styles.button} ${styles.stopButton}`}
                  tabIndex={showAIInput ? undefined : -1}
                >
                  <Icons.Close />
                </button>
              </Tooltip>
            )}
            <Tooltip content="Execute prompt" shortcut="↵">
              <button
                type="submit"
                disabled={!isBtnActive || !showAIInput}
                className={`${styles.button} ${isBtnActive ? styles.buttonActive : styles.buttonDisabled}`}
                tabIndex={showAIInput ? undefined : -1}
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
