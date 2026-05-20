import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { useNotification } from '@/components/Widgets/Notification/Notification';
import { markKeyboardActivity } from '@/utils/keyboard';
import { useEffect } from 'react';
import { SHORTCUTS, SHORTCUT_HIGHLIGHT_EVENT, isMatch } from './Shortcuts';

export function useKeyboardHandler() {
  const sidebarState = SidebarState.useState();
  const logState = LogState.useState();
  const appState = AppState.useState();
  const tabState = TabState.useState();
  const { addNotification: showNotification } = useNotification();
  const editorState = EditorState.useState();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.repeat) return;
      if (!e.isComposing) markKeyboardActivity();

      const states = {
        sidebarState,
        logState,
        appState,
        tabState,
        editorState,
        showNotification,
      };

      if (appState.showShortcuts) {
        const matchingShortcut = SHORTCUTS.find((shortcut) => isMatch(e, shortcut));
        if (matchingShortcut) {
          e.preventDefault();
          if (matchingShortcut.id === 'close-modal') {
            matchingShortcut.action(states);
            return;
          }
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
  }, [sidebarState, logState, appState, tabState, showNotification, editorState]);
}
