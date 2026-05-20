import Settings from '@/components/Storage/Settings';
import {
  findClassInCss,
  findClassReferenceInJs,
  getAssociatedFilePath,
  getStyleAtCursor,
} from '@/utils/navigation';
import { isMac } from '@/utils/os';

export const SHORTCUT_GROUPS = {
  NAVIGATION: 'Navigation',
  EDITOR: 'Editor',
  AI: 'AI',
  TABS: 'Tabs',
  AI_PROMPT: 'AI Prompt',
  GENERAL: 'General',
};

const toggleCssJsAction = ({ editorState, tabState, sidebarState }) => {
  const filePath = tabState.activeTabId;
  if (!filePath) {
    sidebarState((draft) => {
      draft.isSidebarOpen = !draft.isSidebarOpen;
    });
    return;
  }

  const isCss = filePath.endsWith('.css');
  const isJs =
    filePath.endsWith('.js') ||
    filePath.endsWith('.jsx') ||
    filePath.endsWith('.ts') ||
    filePath.endsWith('.tsx');

  if (!isCss && !isJs) {
    sidebarState((draft) => {
      draft.isSidebarOpen = !draft.isSidebarOpen;
    });
    return;
  }

  const code = editorState.fileContents?.[filePath] || '';
  const cursorPos = editorState.cursorPos?.[filePath] || { index: 0 };
  const index = cursorPos.index ?? 0;

  const styleResult = getStyleAtCursor(code, index, isCss);
  const className = styleResult
    ? typeof styleResult === 'string'
      ? styleResult
      : styleResult.className
    : null;
  const identifier = styleResult && typeof styleResult === 'object' ? styleResult.identifier : null;

  let targetPath = null;
  if (isCss) {
    targetPath = getAssociatedFilePath(filePath, editorState.fileContents || {});
  } else {
    targetPath = getAssociatedFilePath(filePath, editorState.fileContents || {}, identifier);
  }

  if (!targetPath) {
    sidebarState((draft) => {
      draft.isSidebarOpen = !draft.isSidebarOpen;
    });
    return;
  }

  const targetContent = editorState.fileContents?.[targetPath] ?? '';
  let targetLoc = null;

  if (className) {
    if (isCss) {
      targetLoc = findClassReferenceInJs(targetContent, className, targetPath, filePath);
    } else {
      targetLoc = findClassInCss(targetContent, className);
    }
  }

  if (!targetLoc) {
    targetLoc = { line: 1, col: 1, index: 0 };
  }

  const fileName = targetPath.substring(targetPath.lastIndexOf('/') + 1);
  const fileObj = {
    name: fileName,
    path: targetPath.split('/'),
    content: targetContent,
  };
  const newTab = {
    id: targetPath,
    type: 'file',
    label: fileName,
    file: fileObj,
  };

  tabState((draft) => {
    const existingTab = draft.openTabs.find((t) => t.id === targetPath);
    if (!existingTab) {
      draft.openTabs = [...draft.openTabs, newTab];
    }
    draft.activeTabId = targetPath;
  });

  editorState((draft) => {
    if (!draft.cursorPos) {
      draft.cursorPos = {};
    }
    draft.cursorPos[targetPath] = targetLoc;
    draft.shouldScrollTo = {
      filePath: targetPath,
      line: targetLoc.line,
      timestamp: Date.now(),
    };
  });
};

export const SHORTCUTS = [
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
    id: 'toggle-inspect-mode',
    group: SHORTCUT_GROUPS.EDITOR,
    desc: 'Toggle Inspect Mode (ReadOnly/Writable)',
    key: 'e',
    displayKey: '⌃E',
    modifier: 'ctrl',
    isGlobal: true,
    action: ({ editorState, showNotification }) => {
      editorState((draft) => {
        const current = draft.isReadOnly ?? Settings.getEditorReadOnly(false);
        const nextVal = !current;
        draft.isReadOnly = nextVal;
        Settings.setEditorReadOnly(nextVal);
        showNotification(nextVal ? 'Inspection mode active' : 'Edit mode active', 'info');
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

        const prevState = hist.past.pop();
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

        const nextState = hist.future.pop();
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

        const nextState = hist.future.pop();
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
    action: ({ tabState, editorState, appState, showNotification }) => {
      const activeTabId = tabState.activeTabId;
      const hasDiff = editorState.pendingDiffs?.[activeTabId];
      if (hasDiff) {
        editorState((draft) => {
          if (draft.pendingDiffs) {
            delete draft.pendingDiffs[activeTabId];
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
    group: SHORTCUT_GROUPS.AI,
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
        if (appState.fs?.writeFileAtPath) {
          appState.fs.writeFileAtPath(activeTabId, prevContent);
        }
        showNotification('Changes cancelled', 'info');
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

export const isMatch = (e, s) => {
  const mac = isMac();
  if (s.platform === 'mac' && !mac) return false;
  if (s.platform === 'win' && mac) return false;

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
  } else if (mod === 'cmd-alt') {
    match = (mac ? meta : ctrl) && alt && !shift;
  } else if (mod === 'alt') {
    match = alt && !meta && !ctrl && !shift;
  } else if (mod === 'none') {
    match = !meta && !ctrl && !shift && !alt;
  }

  if (!match) return false;

  const keys = Array.isArray(s.key) ? s.key : [s.key];
  return keys.some((k) => k.toLowerCase() === e.key.toLowerCase());
};

export const getShortcutsByGroup = () => {
  const groups = {};
  const mac = isMac();
  for (const s of SHORTCUTS) {
    if (s.platform === 'mac' && !mac) continue;
    if (s.platform === 'win' && mac) continue;
    if (!groups[s.group]) groups[s.group] = [];
    // Only add if desc is not already in the group to avoid showing multiple Redo bindings
    if (!groups[s.group].some((item) => item.desc === s.desc)) {
      groups[s.group].push({
        key: s.displayKey,
        desc: s.desc,
      });
    }
  }

  const order = [
    SHORTCUT_GROUPS.NAVIGATION,
    SHORTCUT_GROUPS.AI,
    SHORTCUT_GROUPS.EDITOR,
    SHORTCUT_GROUPS.TABS,
    SHORTCUT_GROUPS.AI_PROMPT,
    SHORTCUT_GROUPS.GENERAL,
  ];

  return order.filter((name) => groups[name]).map((name) => ({ group: name, items: groups[name] }));
};
