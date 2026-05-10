import { AppState } from '@/components/App/AppState';
import { EditorState } from '@/components/App/EditorArea';
import { LogState } from '@/components/App/LogArea';
import { SidebarState } from '@/components/App/Sidebar';
import { TabState } from '@/components/App/TabBar';
import { useNotification } from '@/components/Widgets/Notification/Notification';
import { isMac as checkIsMac } from '@/utils/os';
import { useEffect } from 'react';

export default function KeyboardHandler() {
  const sidebarState = SidebarState.useState();
  const logState = LogState.useState();
  const appState = AppState.useState();
  const tabState = TabState.useState();
  const { addNotification: showNotification } = useNotification();
  const editorState = EditorState.useState();

  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMac = checkIsMac();
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier) {
        const key = e.key.toLowerCase();
        if (key === 'b') {
          e.preventDefault();
          sidebarState((draft) => {
            draft.isSidebarOpen = !draft.isSidebarOpen;
          });
        } else if (key === 'j') {
          e.preventDefault();
          sidebarState((draft) => {
            draft.showAIInput = !draft.showAIInput;
          });
        } else if (key === 'k') {
          e.preventDefault();
          if (e.shiftKey) {
            appState((draft) => {
              draft.showShortcuts = !draft.showShortcuts;
            });
          } else {
            logState((draft) => {
              draft.logs = [];
            });
            showNotification('Logs cleared', 'info');
          }
        } else if (key === 'u') {
          e.preventDefault();
          tabState((draft) => {
            draft.activeTabId = 'ai-logs';
          });
        } else if (key === 'i') {
          e.preventDefault();
          tabState((draft) => {
            draft.activeTabId = 'preview';
          });
        } else if (key === 's') {
          e.preventDefault();
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
        } else if (key === 't' && e.shiftKey) {
          e.preventDefault();
          appState((draft) => {
            draft.theme = draft.theme === 'light' ? 'dark' : 'light';
          });
        } else if (e.key === 'Enter') {
          e.preventDefault();
          appState((draft) => {
            draft.compileRequest = (draft.compileRequest || 0) + 1;
          });
        } else if (key === 'f') {
          e.preventDefault();
          if (!sidebarState.isSidebarOpen) {
            sidebarState((draft) => {
              draft.isSidebarOpen = true;
            });
          }
          window.dispatchEvent(new CustomEvent('focus-file-search'));
        } else if (e.key === 'Backspace' || e.key === '.') {
          const activeTabId = tabState.activeTabId;
          const diff = editorState.pendingDiffs?.[activeTabId];
          if (diff) {
            e.preventDefault();
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
        }
      } else if (e.ctrlKey && e.key.toLowerCase() === 'w') {
        // Ctrl + W is safe on Mac browsers (unlike Cmd + W)
        e.preventDefault();
        const { activeTabId } = tabState;
        if (e.shiftKey) {
          // Ctrl + Shift + W to close all
          tabState((draft) => {
            draft.openTabs = [];
            draft.activeTabId = null;
          });
          showNotification('All tabs closed', 'info');
        } else if (activeTabId) {
          // Ctrl + W to close current
          tabState((draft) => {
            const filtered = draft.openTabs.filter((t) => t.id !== activeTabId);
            draft.openTabs = filtered;
            if (draft.activeTabId === activeTabId) {
              const newActiveTabId = filtered.length > 0 ? filtered[filtered.length - 1].id : null;
              draft.activeTabId = newActiveTabId;
            }
          });
        }
      }
      if (e.key === 'Escape') {
        appState((draft) => {
          if (draft.showShortcuts) {
            draft.showShortcuts = false;
          }
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarState, logState, appState, tabState, showNotification, editorState]);

  return null;
}
