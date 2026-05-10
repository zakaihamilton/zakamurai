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
    displayKey: '⌘B',
    modifier: 'cmd',
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
    displayKey: '⌘J',
    modifier: 'cmd',
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
    desc: 'Show Logs',
    key: 'u',
    displayKey: '⌘U',
    modifier: 'cmd',
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
    desc: 'Show Preview',
    key: 'i',
    displayKey: '⌘I',
    modifier: 'cmd',
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
    key: 'f',
    displayKey: '⌘F',
    modifier: 'cmd',
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
    displayKey: '⌘K',
    modifier: 'cmd',
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
    displayKey: '⌘⇧T',
    modifier: 'cmd-shift',
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
    displayKey: '⌘⇧K',
    modifier: 'cmd-shift',
    isGlobal: true,
    action: ({ appState }) => {
      appState((draft) => {
        draft.showShortcuts = !draft.showShortcuts;
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
    groups[s.group].push({
      key: s.displayKey,
      desc: s.desc,
    });
  }
  return Object.entries(groups).map(([group, items]) => ({ group, items }));
};
