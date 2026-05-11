import { isMac } from '@/utils/os';

export const SHORTCUT_GROUPS = {
  NAVIGATION: 'Navigation',
  EDITOR_AI: 'Editor & AI',
  TABS: 'Tabs',
  AI_PROMPT: 'AI Prompt',
  GENERAL: 'General',
};

export const SHORTCUTS = [
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
    desc: 'Toggle AI Prompt',
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
    id: 'approve-save',
    group: SHORTCUT_GROUPS.EDITOR_AI,
    desc: 'Approve & Save Changes',
    key: 's',
    displayKey: '⌘S',
    modifier: 'cmd',
    isGlobal: true,
    action: ({ tabState, editorState, appState, showNotification }) => {
      const activeTabId = tabState.activeTabId;
      const hasDiff = editorState.pendingDiffs?.[activeTabId];
      if (hasDiff) {
        editorState((draft) => {
          if (draft.pendingDiffs) {
            const nextDiffs = { ...draft.pendingDiffs };
            delete nextDiffs[activeTabId];
            draft.pendingDiffs = nextDiffs;
          }
        });
        const content = editorState.fileContents?.[activeTabId];
        if (appState.fs?.writeFileAtPath && content !== undefined) {
          appState.fs.writeFileAtPath(activeTabId, content);
        }
        showNotification('Changes approved & saved', 'success');
      } else {
        showNotification('Project saved', 'success');
      }
    },
  },
  {
    id: 'cancel-changes',
    group: SHORTCUT_GROUPS.EDITOR_AI,
    desc: 'Cancel AI Changes',
    key: ['.', 'Backspace'],
    displayKey: '⌘. / ⌘⌫',
    modifier: 'cmd',
    isGlobal: true,
    action: ({ tabState, editorState, appState, showNotification }) => {
      const activeTabId = tabState.activeTabId;
      const diff = editorState.pendingDiffs?.[activeTabId];
      if (diff) {
        const prevContent = diff.originalContent;
        editorState((draft) => {
          draft.fileContents = { ...draft.fileContents, [activeTabId]: prevContent };
          if (draft.pendingDiffs) {
            const nextDiffs = { ...draft.pendingDiffs };
            delete nextDiffs[activeTabId];
            draft.pendingDiffs = nextDiffs;
          }
        });
        if (appState.fs?.writeFileAtPath) {
          appState.fs.writeFileAtPath(activeTabId, prevContent);
        }
        showNotification('Changes cancelled', 'info');
      }
    },
  },
  {
    id: 'undo',
    group: SHORTCUT_GROUPS.EDITOR_AI,
    desc: 'Undo',
    key: 'z',
    displayKey: '⌘Z',
    modifier: 'cmd',
    isGlobal: true,
    action: ({ editorState, tabState }) => {
      const filePath = tabState.activeTabId;
      if (!filePath) return;

      editorState((draft) => {
        if (!draft.history) draft.history = {};
        if (!draft.history[filePath]) {
          draft.history[filePath] = { past: [], future: [] };
        }
        const hist = draft.history[filePath];

        const currentContent = draft.fileContents[filePath];
        const currentCursor = draft.cursorPos?.[filePath];

        // If the current content hasn't been saved to history yet (because of the 300ms delay),
        // restore the last snapshot.
        if (hist.lastSnapshotContent !== undefined && currentContent !== hist.lastSnapshotContent) {
          if (!hist.future) hist.future = [];
          hist.future.push({ content: currentContent, cursor: currentCursor });

          draft.fileContents[filePath] = hist.lastSnapshotContent;
          if (hist.lastSnapshotCursor !== undefined) {
            if (!draft.cursorPos) draft.cursorPos = {};
            draft.cursorPos[filePath] = hist.lastSnapshotCursor;
          }
          return;
        }

        if (!hist.past || hist.past.length === 0) return;

        const prevState = hist.past.pop();
        if (!hist.future) hist.future = [];
        hist.future.push({ content: currentContent, cursor: currentCursor });

        draft.fileContents[filePath] = prevState.content;
        if (prevState.cursor !== undefined) {
          if (!draft.cursorPos) draft.cursorPos = {};
          draft.cursorPos[filePath] = prevState.cursor;
        }
      });
    },
  },
  {
    id: 'redo',
    group: SHORTCUT_GROUPS.EDITOR_AI,
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
        const hist = draft.history[filePath];
        if (!hist.future || hist.future.length === 0) return;

        const currentContent = draft.fileContents[filePath];
        const currentCursor = draft.cursorPos?.[filePath];

        const nextState = hist.future.pop();
        if (!hist.past) hist.past = [];
        hist.past.push({ content: currentContent, cursor: currentCursor });

        draft.fileContents[filePath] = nextState.content;
        if (nextState.cursor !== undefined) {
          if (!draft.cursorPos) draft.cursorPos = {};
          draft.cursorPos[filePath] = nextState.cursor;
        }
      });
    },
  },
  {
    id: 'redo-y',
    group: SHORTCUT_GROUPS.EDITOR_AI,
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
        const hist = draft.history[filePath];
        if (!hist.future || hist.future.length === 0) return;

        const currentContent = draft.fileContents[filePath];
        const currentCursor = draft.cursorPos?.[filePath];

        const nextState = hist.future.pop();
        if (!hist.past) hist.past = [];
        hist.past.push({ content: currentContent, cursor: currentCursor });

        draft.fileContents[filePath] = nextState.content;
        if (nextState.cursor !== undefined) {
          if (!draft.cursorPos) draft.cursorPos = {};
          draft.cursorPos[filePath] = nextState.cursor;
        }
      });
    },
  },
  {
    id: 'compile-project',
    group: SHORTCUT_GROUPS.EDITOR_AI,
    desc: 'Compile Project',
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
    id: 'compile-project-silent',
    group: SHORTCUT_GROUPS.EDITOR_AI,
    desc: 'Compile Project (Stay on Page)',
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
    id: 'clear-logs',
    group: SHORTCUT_GROUPS.EDITOR_AI,
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
    group: SHORTCUT_GROUPS.EDITOR_AI,
    desc: 'Toggle Theme',
    key: 't',
    displayKey: '⌃⇧T',
    modifier: 'ctrl-shift',
    isGlobal: true,
    action: ({ appState }) => {
      appState((draft) => {
        draft.theme = draft.theme === 'light' ? 'dark' : 'light';
      });
    },
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
      showNotification('All tabs closed', 'info');
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
    id: 'indent',
    group: SHORTCUT_GROUPS.EDITOR_AI,
    desc: 'Indent Selection',
    key: 'Tab',
    displayKey: 'Tab',
    modifier: 'none',
    isGlobal: false,
  },
  {
    id: 'outdent',
    group: SHORTCUT_GROUPS.EDITOR_AI,
    desc: 'Outdent Selection',
    key: 'Tab',
    displayKey: '⇧Tab',
    modifier: 'shift',
    isGlobal: false,
  },
  {
    id: 'toggle-comment',
    group: SHORTCUT_GROUPS.EDITOR_AI,
    desc: 'Toggle Line Comment',
    key: '/',
    displayKey: '⌘/',
    modifier: 'cmd',
    isGlobal: false,
  },
  {
    id: 'jump-to-line',
    group: SHORTCUT_GROUPS.EDITOR_AI,
    desc: 'Jump to Line',
    key: 'g',
    displayKey: '⌃G',
    modifier: 'ctrl',
    isGlobal: false,
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
      });
    },
  },
];

export const isMatch = (e, s) => {
  const mac = isMac();
  const meta = e.metaKey;
  const ctrl = e.ctrlKey;
  const shift = e.shiftKey;
  const alt = e.altKey;

  const mod = s.modifier;

  let match = false;
  if (mod === 'cmd') {
    match = (mac ? meta : ctrl) && !shift && !alt;
  } else if (mod === 'cmd-shift') {
    match = (mac ? meta : ctrl) && shift && !alt;
  } else if (mod === 'ctrl') {
    match = ctrl && !meta && !shift && !alt;
  } else if (mod === 'ctrl-shift') {
    match = ctrl && shift && !meta && !alt;
  } else if (mod === 'none') {
    match = !meta && !ctrl && !shift && !alt;
  }

  if (!match) return false;

  const keys = Array.isArray(s.key) ? s.key : [s.key];
  return keys.some((k) => k.toLowerCase() === e.key.toLowerCase());
};

export const getShortcutsByGroup = () => {
  const groups = {};
  for (const s of SHORTCUTS) {
    if (!groups[s.group]) groups[s.group] = [];
    // Only add if desc is not already in the group to avoid showing multiple Redo bindings
    if (!groups[s.group].some((item) => item.desc === s.desc)) {
      groups[s.group].push({
        key: s.displayKey,
        desc: s.desc,
      });
    }
  }
  return Object.entries(groups).map(([group, items]) => ({ group, items }));
};
