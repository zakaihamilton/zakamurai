import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { useNotification } from '@/components/Widgets/Notification/Notification';
import { useEffect } from 'react';
import { SHORTCUTS, isMatch } from '../Manager/Shortcuts';

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

      const states = {
        sidebarState,
        logState,
        appState,
        tabState,
        editorState,
        showNotification,
      };

      for (const shortcut of SHORTCUTS) {
        if (shortcut.isGlobal && shortcut.action && isMatch(e, shortcut)) {
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
