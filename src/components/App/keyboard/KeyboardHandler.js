import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { useFileSystem } from '@/components/Storage';
import { useNotification } from '@/components/ui/Notification';
import { markKeyboardActivity } from '@/utils/keyboard';
import { useEffect } from 'react';
import { SHORTCUTS, SHORTCUT_HIGHLIGHT_EVENT, isMatch } from './Shortcuts';

export function useKeyboardHandler() {
  // Passive: shortcuts only mutate stores; avoid re-renders on every key change.
  const sidebarState = SidebarState.usePassiveState();
  const logState = LogState.usePassiveState();
  const appState = AppState.usePassiveState();
  const tabState = TabState.usePassiveState();
  const fs = useFileSystem();
  const { addNotification: showNotification } = useNotification();
  const editorState = EditorState.usePassiveState();

  useEffect(() => {
    if (!sidebarState || !logState || !appState || !tabState || !editorState) return undefined;

    const handleKeyDown = (e) => {
      if (e.repeat) return;
      if (!e.isComposing) markKeyboardActivity();

      const states = {
        sidebarState,
        logState,
        appState,
        tabState,
        editorState,
        fs,
        showNotification,
      };

      if (appState.showShortcuts) {
        const closeModalShortcut = SHORTCUTS.find(
          (shortcut) => shortcut.id === 'close-modal' && isMatch(e, shortcut),
        );
        if (closeModalShortcut) {
          e.preventDefault();
          closeModalShortcut.action(states);
          return;
        }

        const matchingShortcut = SHORTCUTS.find((shortcut) => isMatch(e, shortcut));
        if (matchingShortcut) {
          e.preventDefault();
          window.dispatchEvent(
            new CustomEvent(SHORTCUT_HIGHLIGHT_EVENT, {
              detail: { shortcutId: matchingShortcut.id },
            }),
          );
        }
        return;
      }

      for (const shortcut of SHORTCUTS) {
        if (shortcut.isGlobal && shortcut.action && isMatch(e, shortcut)) {
          if (
            (shortcut.id === 'navigate-back' || shortcut.id === 'navigate-forward') &&
            (e.target.tagName?.toLowerCase() === 'input' ||
              e.target.tagName?.toLowerCase() === 'textarea')
          ) {
            continue;
          }
          e.preventDefault();
          shortcut.action(states);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarState, logState, appState, tabState, showNotification, editorState, fs]);
}
