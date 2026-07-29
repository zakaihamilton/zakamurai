import type { ShortcutDefinition } from '@/components/App/types';
import { deleteKeysWithPrefixInDraft } from '@/components/state/StateUtils';
import { SHORTCUT_GROUPS } from './constants';
import {
  navigateBackAction,
  navigateForwardAction,
  switchTabAction,
  toggleCssJsAction,
} from './actions';

export const SHORTCUTS: ShortcutDefinition[] = [
  {
    id: 'navigate-back',
    group: SHORTCUT_GROUPS.NAVIGATION,
    desc: 'Navigate Back',
    key: 'ArrowLeft',
    displayKey: 'Alt+←',
    modifier: 'alt',
    isGlobal: true,
    action: navigateBackAction,
  },
  {
    id: 'navigate-forward',
    group: SHORTCUT_GROUPS.NAVIGATION,
    desc: 'Navigate Forward',
    key: 'ArrowRight',
    displayKey: 'Alt+→',
    modifier: 'alt',
    isGlobal: true,
    action: navigateForwardAction,
  },
  {
    id: 'navigate-back-cmd',
    group: SHORTCUT_GROUPS.NAVIGATION,
    desc: 'Navigate Back',
    key: '[',
    displayKey: '⌘[',
    modifier: 'cmd',
    platform: 'mac',
    isGlobal: true,
    action: navigateBackAction,
  },
  {
    id: 'navigate-forward-cmd',
    group: SHORTCUT_GROUPS.NAVIGATION,
    desc: 'Navigate Forward',
    key: ']',
    displayKey: '⌘]',
    modifier: 'cmd',
    platform: 'mac',
    isGlobal: true,
    action: navigateForwardAction,
  },
  {
    id: 'navigate-back-ctrl-win',
    group: SHORTCUT_GROUPS.NAVIGATION,
    desc: 'Navigate Back',
    key: '[',
    displayKey: 'Ctrl+[',
    modifier: 'ctrl',
    platform: 'win',
    isGlobal: true,
    action: navigateBackAction,
  },
  {
    id: 'navigate-forward-ctrl-win',
    group: SHORTCUT_GROUPS.NAVIGATION,
    desc: 'Navigate Forward',
    key: ']',
    displayKey: 'Ctrl+]',
    modifier: 'ctrl',
    platform: 'win',
    isGlobal: true,
    action: navigateForwardAction,
  },
  {
    id: 'toggle-css-js',
    group: SHORTCUT_GROUPS.NAVIGATION,
    desc: 'Toggle between Component and CSS Module',
    key: 'b',
    displayKey: '⌘B',
    modifier: 'cmd',
    platform: 'mac',
    isGlobal: true,
    action: toggleCssJsAction,
  },
  {
    id: 'toggle-css-js-win',
    group: SHORTCUT_GROUPS.NAVIGATION,
    desc: 'Toggle between Component and CSS Module',
    key: 'b',
    displayKey: 'Alt+B',
    modifier: 'alt',
    platform: 'win',
    isGlobal: true,
    action: toggleCssJsAction,
  },
  {
    id: 'toggle-sidebar',
    group: SHORTCUT_GROUPS.NAVIGATION,
    desc: 'Toggle Sidebar',
    key: 'b',
    displayKey: '⌃B',
    modifier: 'ctrl',
    isGlobal: true,
    action: ({ sidebarState }) => {
      sidebarState((draft) => {
        draft.isSidebarOpen = !draft.isSidebarOpen;
      });
    },
  },
  {
    id: 'toggle-ai-input',
    group: SHORTCUT_GROUPS.NAVIGATION,
    desc: 'Toggle Agent',
    key: 'j',
    displayKey: '⌃J',
    modifier: 'ctrl',
    isGlobal: true,
    action: ({ sidebarState }) => {
      sidebarState((draft) => {
        draft.showAIInput = !draft.showAIInput;
      });
    },
  },
  {
    id: 'show-logs',
    group: SHORTCUT_GROUPS.NAVIGATION,
    desc: 'Goto Logs',
    key: 'u',
    displayKey: '⌃U',
    modifier: 'ctrl',
    isGlobal: true,
    action: ({ tabState }) => {
      tabState((draft) => {
        draft.activeTabId = 'ai-logs';
      });
    },
  },
  {
    id: 'show-preview',
    group: SHORTCUT_GROUPS.NAVIGATION,
    desc: 'Goto Preview',
    key: 'i',
    displayKey: '⌃I',
    modifier: 'ctrl',
    isGlobal: true,
    action: ({ tabState }) => {
      tabState((draft) => {
        draft.activeTabId = 'preview';
      });
    },
  },
  {
    id: 'search-files',
    group: SHORTCUT_GROUPS.NAVIGATION,
    desc: 'Search Files',
    key: 'p',
    displayKey: '⌃P',
    modifier: 'ctrl',
    isGlobal: true,
    action: ({ sidebarState }) => {
      if (!sidebarState.isSidebarOpen) {
        sidebarState((draft) => {
          draft.isSidebarOpen = true;
        });
      }
      window.dispatchEvent(new CustomEvent('focus-file-search'));
    },
  },
  {
    id: 'toggle-inspect-mode',
    group: SHORTCUT_GROUPS.EDITOR,
    desc: 'Toggle Inspect Mode (ReadOnly/Writable)',
    key: 'e',
    displayKey: '⌃E',
    modifier: 'ctrl',
    isGlobal: true,
    action: ({ editorState, showNotification }) => {
      editorState((draft) => {
        const nextVal = draft.isReadOnly !== true;
        draft.isReadOnly = nextVal;
        showNotification?.(nextVal ? 'Inspection mode active' : 'Edit mode active', 'info');
      });
    },
  },
  {
    id: 'undo',
    group: SHORTCUT_GROUPS.EDITOR,
    desc: 'Undo',
    key: 'z',
    displayKey: '⌘Z',
    modifier: 'cmd',
    isGlobal: true,
    action: ({ editorState, tabState }) => {
      const filePath = tabState.activeTabId;
      if (!filePath) return;

      editorState((draft) => {
        const history = { ...(draft.history || {}) };
        if (!history[filePath]) {
          history[filePath] = { past: [], future: [] };
        } else {
          history[filePath] = { ...history[filePath] };
        }
        const hist = history[filePath];

        const currentContent = draft.fileContents[filePath];
        const currentCursor = draft.cursorPos?.[filePath] || { line: 1, col: 1, index: 0 };

        if (hist.lastSnapshotContent !== undefined && currentContent !== hist.lastSnapshotContent) {
          const future = [...(hist.future || [])];
          future.push({ content: currentContent, cursor: currentCursor });
          if (future.length > 100) future.shift();
          hist.future = future;

          draft.fileContents = { ...draft.fileContents, [filePath]: hist.lastSnapshotContent };
          if (hist.lastSnapshotCursor !== undefined) {
            draft.cursorPos = { ...draft.cursorPos, [filePath]: { ...hist.lastSnapshotCursor } };
          }
          draft.history = history;
          return;
        }

        if (!hist.past || hist.past.length === 0) return;

        const past = [...hist.past];
        const prevState = past.pop();
        if (!prevState) return;
        hist.past = past;
        const future = [...(hist.future || [])];
        future.push({ content: currentContent, cursor: currentCursor });
        if (future.length > 100) future.shift();
        hist.future = future;

        draft.fileContents = { ...draft.fileContents, [filePath]: prevState.content };
        if (prevState.cursor !== undefined) {
          draft.cursorPos = { ...draft.cursorPos, [filePath]: { ...prevState.cursor } };
        }
        draft.history = history;
      });
    },
  },
  {
    id: 'redo',
    group: SHORTCUT_GROUPS.EDITOR,
    desc: 'Redo',
    key: 'z',
    displayKey: '⌘⇧Z',
    modifier: 'cmd-shift',
    isGlobal: true,
    action: ({ editorState, tabState }) => {
      const filePath = tabState.activeTabId;
      if (!filePath) return;

      editorState((draft) => {
        if (!draft.history || !draft.history[filePath]) return;
        const history = { ...draft.history };
        const hist = { ...history[filePath] };
        if (!hist.future || hist.future.length === 0) return;

        const currentContent = draft.fileContents[filePath];
        const currentCursor = draft.cursorPos?.[filePath] || { line: 1, col: 1, index: 0 };

        const future = [...hist.future];
        const nextState = future.pop();
        if (!nextState) return;
        hist.future = future;
        const past = [...(hist.past || [])];
        past.push({ content: currentContent, cursor: currentCursor });
        hist.past = past;

        draft.fileContents = { ...draft.fileContents, [filePath]: nextState.content };
        if (nextState.cursor !== undefined) {
          draft.cursorPos = { ...draft.cursorPos, [filePath]: { ...nextState.cursor } };
        }
        history[filePath] = hist;
        draft.history = history;
      });
    },
  },
  {
    id: 'redo-y',
    group: SHORTCUT_GROUPS.EDITOR,
    desc: 'Redo',
    key: 'y',
    displayKey: '⌘Y',
    modifier: 'cmd',
    isGlobal: true,
    action: ({ editorState, tabState }) => {
      const filePath = tabState.activeTabId;
      if (!filePath) return;

      editorState((draft) => {
        if (!draft.history || !draft.history[filePath]) return;
        const history = { ...draft.history };
        const hist = { ...history[filePath] };
        if (!hist.future || hist.future.length === 0) return;

        const currentContent = draft.fileContents[filePath];
        const currentCursor = draft.cursorPos?.[filePath] || { line: 1, col: 1, index: 0 };

        const future = [...hist.future];
        const nextState = future.pop();
        if (!nextState) return;
        hist.future = future;
        const past = [...(hist.past || [])];
        past.push({ content: currentContent, cursor: currentCursor });
        hist.past = past;

        draft.fileContents = { ...draft.fileContents, [filePath]: nextState.content };
        if (nextState.cursor !== undefined) {
          draft.cursorPos = { ...draft.cursorPos, [filePath]: { ...nextState.cursor } };
        }
        history[filePath] = hist;
        draft.history = history;
      });
    },
  },
  {
    id: 'build-project',
    group: SHORTCUT_GROUPS.EDITOR,
    desc: 'Build Project',
    key: 'Enter',
    displayKey: '⌘↵',
    modifier: 'cmd',
    isGlobal: true,
    action: ({ appState }) => {
      appState((draft) => {
        draft.compileRequest = (draft.compileRequest || 0) + 1;
      });
    },
  },
  {
    id: 'build-project-silent',
    group: SHORTCUT_GROUPS.EDITOR,
    desc: 'Build Project (Stay on Page)',
    key: 'Enter',
    displayKey: '⌘⇧↵',
    modifier: 'cmd-shift',
    isGlobal: true,
    action: ({ appState }) => {
      appState((draft) => {
        draft.silentCompileRequest = (draft.silentCompileRequest || 0) + 1;
      });
    },
  },
  {
    id: 'indent',
    group: SHORTCUT_GROUPS.EDITOR,
    desc: 'Indent Selection',
    key: 'Tab',
    displayKey: 'Tab',
    modifier: 'none',
    isGlobal: false,
  },
  {
    id: 'outdent',
    group: SHORTCUT_GROUPS.EDITOR,
    desc: 'Outdent Selection',
    key: 'Tab',
    displayKey: '⇧Tab',
    modifier: 'shift',
    isGlobal: false,
  },
  {
    id: 'toggle-comment',
    group: SHORTCUT_GROUPS.EDITOR,
    desc: 'Toggle Line Comment',
    key: '/',
    displayKey: '⌘/',
    modifier: 'cmd',
    isGlobal: false,
  },
  {
    id: 'jump-to-line',
    group: SHORTCUT_GROUPS.EDITOR,
    desc: 'Jump to Line',
    key: 'g',
    displayKey: '⌃G',
    modifier: 'ctrl',
    isGlobal: false,
  },
  {
    id: 'format-code',
    group: SHORTCUT_GROUPS.EDITOR,
    desc: 'Format Code',
    key: 'f',
    displayKey: '⌃⇧F',
    modifier: 'ctrl-shift',
    isGlobal: false,
  },
  {
    id: 'approve-save',
    group: SHORTCUT_GROUPS.AI,
    desc: 'Approve & Save Changes',
    key: 's',
    displayKey: '⌘S',
    modifier: 'cmd',
    isGlobal: true,
    action: ({ tabState, editorState, fs, showNotification }) => {
      const activeTabId = tabState.activeTabId;
      if (!activeTabId) return;
      const tabPath = activeTabId.split('/');
      const hasDeletion = editorState.pendingDeletions?.[activeTabId];
      const hasDiff = editorState.pendingDiffs?.[activeTabId];
      if (hasDeletion) {
        editorState((draft) => {
          deleteKeysWithPrefixInDraft(
            draft,
            [
              'fileContents',
              'pendingDiffs',
              'pendingDeletions',
              'history',
              'cursorPos',
              'selectedLines',
            ],
            activeTabId,
          );
        });
        tabState((draft) => {
          draft.openTabs = draft.openTabs.filter(
            (tab) => tab.id !== activeTabId && !tab.id.startsWith(`${activeTabId}/`),
          );
          if (
            draft.activeTabId === activeTabId ||
            draft.activeTabId?.startsWith(`${activeTabId}/`)
          ) {
            draft.activeTabId = draft.openTabs.at(-1)?.id || null;
          }
        });
        if (fs?.deleteFileAtPath) {
          fs.deleteFileAtPath(tabPath);
        }
        showNotification?.('Deletion approved', 'success');
      } else if (hasDiff) {
        editorState((draft) => {
          if (draft.pendingDiffs) {
            const nextDiffs = { ...draft.pendingDiffs };
            delete nextDiffs[activeTabId];
            draft.pendingDiffs = nextDiffs;
          }
        });
        const content = editorState.fileContents?.[activeTabId];
        if (fs?.writeFileAtPath && content !== undefined) {
          fs.writeFileAtPath(tabPath, content);
        }
        showNotification?.('Changes approved & saved', 'success');
      } else {
        showNotification?.('Project saved', 'success');
      }
    },
  },
  {
    id: 'cancel-changes',
    group: SHORTCUT_GROUPS.AI,
    desc: 'Cancel AI Changes',
    key: ['.', 'Backspace'],
    displayKey: '⌘. / ⌘⌫',
    modifier: 'cmd',
    isGlobal: true,
    action: ({ tabState, editorState, fs, showNotification }) => {
      const activeTabId = tabState.activeTabId;
      if (!activeTabId) return;
      const tabPath = activeTabId.split('/');
      const pendingDeletion = editorState.pendingDeletions?.[activeTabId];
      if (pendingDeletion) {
        editorState((draft) => {
          if (draft.pendingDeletions) {
            const next = { ...draft.pendingDeletions };
            delete next[activeTabId];
            draft.pendingDeletions = next;
          }
        });
        showNotification?.('Deletion cancelled', 'info');
        return;
      }
      const diff = editorState.pendingDiffs?.[activeTabId];
      if (diff) {
        const prevContent = diff.originalContent;
        const prevCursor = diff.originalCursorPos;
        editorState((draft) => {
          draft.fileContents = { ...draft.fileContents, [activeTabId]: prevContent };
          if (prevCursor) {
            draft.cursorPos = { ...draft.cursorPos, [activeTabId]: prevCursor };
          }
          if (draft.pendingDiffs) {
            const nextDiffs = { ...draft.pendingDiffs };
            delete nextDiffs[activeTabId];
            draft.pendingDiffs = nextDiffs;
          }
        });
        if (fs?.writeFileAtPath) {
          fs.writeFileAtPath(tabPath, prevContent);
        }
        showNotification?.('Changes cancelled', 'info');
      }
    },
  },
  {
    id: 'show-ai-completion-debug',
    group: SHORTCUT_GROUPS.AI,
    desc: 'Show AI Completion Debug',
    key: 'c',
    displayKey: '⌃⇧C',
    modifier: 'ctrl-shift',
    isGlobal: true,
    action: ({ appState }) => {
      appState((draft) => {
        draft.showCompletionDebug = !draft.showCompletionDebug;
      });
    },
  },
  {
    id: 'accept-ai-completion',
    group: SHORTCUT_GROUPS.AI,
    desc: 'Accept Full AI Suggestion',
    key: 'Tab',
    displayKey: 'Tab',
    modifier: 'none',
    isGlobal: false,
  },
  {
    id: 'accept-ai-completion-word-mac',
    group: SHORTCUT_GROUPS.AI,
    desc: 'Accept Next Word of AI Suggestion',
    key: 'ArrowRight',
    displayKey: '⌘→',
    modifier: 'cmd',
    platform: 'mac',
    isGlobal: false,
  },
  {
    id: 'accept-ai-completion-word-win',
    group: SHORTCUT_GROUPS.AI,
    desc: 'Accept Next Word of AI Suggestion',
    key: 'ArrowRight',
    displayKey: 'Ctrl+→',
    modifier: 'ctrl',
    platform: 'win',
    isGlobal: false,
  },
  {
    id: 'dismiss-ai-completion',
    group: SHORTCUT_GROUPS.AI,
    desc: 'Dismiss AI Suggestion / Stop Thinking',
    key: 'Escape',
    displayKey: 'Esc',
    modifier: 'none',
    isGlobal: false,
  },
  {
    id: 'close-current-tab',
    group: SHORTCUT_GROUPS.TABS,
    desc: 'Close Current Tab',
    key: 'w',
    displayKey: '⌃W',
    modifier: 'ctrl',
    isGlobal: true,
    action: ({ tabState }) => {
      const { activeTabId } = tabState;
      if (activeTabId) {
        tabState((draft) => {
          const filtered = draft.openTabs.filter((t) => t.id !== activeTabId);
          draft.openTabs = filtered;
          if (draft.activeTabId === activeTabId) {
            const newActiveTabId = filtered.length > 0 ? filtered[filtered.length - 1].id : null;
            draft.activeTabId = newActiveTabId;
          }
        });
      }
    },
  },
  {
    id: 'next-tab',
    group: SHORTCUT_GROUPS.TABS,
    desc: 'Next Tab',
    key: 't',
    displayKey: '⌃T',
    modifier: 'ctrl',
    isGlobal: true,
    action: (states) => switchTabAction(states, 1),
  },
  {
    id: 'previous-tab',
    group: SHORTCUT_GROUPS.TABS,
    desc: 'Previous Tab',
    key: 't',
    displayKey: '⌃⇧T',
    modifier: 'ctrl-shift',
    isGlobal: true,
    action: (states) => switchTabAction(states, -1),
  },
  {
    id: 'close-all-tabs',
    group: SHORTCUT_GROUPS.TABS,
    desc: 'Close All Tabs',
    key: 'w',
    displayKey: '⌃⇧W',
    modifier: 'ctrl-shift',
    isGlobal: true,
    action: ({ tabState, showNotification }) => {
      tabState((draft) => {
        draft.openTabs = [];
        draft.activeTabId = null;
      });
      showNotification?.('All tabs closed', 'info');
    },
  },
  {
    id: 'execute-prompt',
    group: SHORTCUT_GROUPS.AI_PROMPT,
    desc: 'Execute Prompt',
    key: 'Enter',
    displayKey: '↵',
    modifier: 'none',
    isGlobal: false,
  },
  {
    id: 'insert-newline',
    group: SHORTCUT_GROUPS.AI_PROMPT,
    desc: 'Insert Newline',
    key: 'Enter',
    displayKey: '⌘↵',
    modifier: 'cmd',
    isGlobal: false,
  },
  {
    id: 'stop-ai',
    group: SHORTCUT_GROUPS.AI_PROMPT,
    desc: 'Stop AI Generation',
    key: '.',
    displayKey: '⌘.',
    modifier: 'cmd',
    isGlobal: false,
  },
  {
    id: 'show-shortcuts',
    group: SHORTCUT_GROUPS.GENERAL,
    desc: 'Show Keyboard Shortcuts',
    key: 'k',
    displayKey: '⌃⇧K',
    modifier: 'ctrl-shift',
    isGlobal: true,
    action: ({ appState }) => {
      appState((draft) => {
        draft.showShortcuts = !draft.showShortcuts;
      });
    },
  },
  {
    id: 'clear-logs',
    group: SHORTCUT_GROUPS.GENERAL,
    desc: 'Clear Logs (in Log Area)',
    key: 'k',
    displayKey: '⌃K',
    modifier: 'ctrl',
    isGlobal: true,
    action: ({ logState, showNotification }) => {
      logState((draft) => {
        draft.logs = [];
      });
      showNotification('Logs cleared', 'info');
    },
  },
  {
    id: 'toggle-theme',
    group: SHORTCUT_GROUPS.GENERAL,
    desc: 'Toggle Theme',
    key: 'l',
    displayKey: '⌃L',
    modifier: 'ctrl',
    isGlobal: true,
    action: ({ appState }) => {
      appState((draft) => {
        draft.theme = draft.theme === 'light' ? 'dark' : 'light';
      });
    },
  },
  {
    id: 'close-modal',
    group: SHORTCUT_GROUPS.GENERAL,
    desc: 'Close Modal / Cancel',
    key: 'Escape',
    displayKey: 'Esc',
    modifier: 'none',
    isGlobal: true,
    action: ({ appState }) => {
      appState((draft) => {
        if (draft.showShortcuts) {
          draft.showShortcuts = false;
        }
        if (draft.showCompletionDebug) {
          draft.showCompletionDebug = false;
        }
      });
    },
  },
];
