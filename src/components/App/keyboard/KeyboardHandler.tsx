import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { ChangeSetState } from '@/components/Workspace';
import type { FileSystemApi } from '@/components/App/types';
import { useFileSystem } from '@/components/Storage';
import { useNotification } from '@/components/ui/Notification';
import { markKeyboardActivity } from '@/utils/keyboard';
import { useEffect } from 'react';
import { SHORTCUT_GROUPS, SHORTCUTS, SHORTCUT_HIGHLIGHT_EVENT, isMatch } from './Shortcuts';

export function useKeyboardHandler() {
  const sidebarState = SidebarState.usePassiveState();
  const logState = LogState.usePassiveState();
  const appState = AppState.usePassiveState();
  const tabState = TabState.usePassiveState();
  const fs = useFileSystem() as FileSystemApi;
  const { addNotification: showNotification } = useNotification();
  const editorState = EditorState.usePassiveState();
  const changeSetState = ChangeSetState.usePassiveState();

  useEffect(() => {
    if (!sidebarState || !logState || !appState || !tabState || !editorState) return undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (!e.isComposing) markKeyboardActivity();

      const target = e.target as HTMLElement | null;
      const states = {
        sidebarState,
        logState,
        appState,
        tabState,
        editorState,
        changeSetState,
        fs,
        showNotification,
        event: e,
      };

      if (appState.showShortcuts) {
        const closeModalShortcut = SHORTCUTS.find(
          (shortcut) => shortcut.id === 'close-modal' && isMatch(e, shortcut),
        );
        if (closeModalShortcut?.action) {
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

      const isEditableTarget = Boolean(
        target &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable),
      );

      for (const shortcut of SHORTCUTS) {
        if (shortcut.isGlobal && shortcut.action && isMatch(e, shortcut)) {
          if (isEditableTarget) {
            const isTextEditingShortcut =
              shortcut.group === SHORTCUT_GROUPS.EDITOR ||
              shortcut.id.startsWith('navigate-') ||
              shortcut.id.startsWith('cancel-ai') ||
              shortcut.key === 'Backspace' ||
              (Array.isArray(shortcut.key) && shortcut.key.includes('Backspace'));
            if (isTextEditingShortcut) {
              continue;
            }
          }
          e.preventDefault();
          shortcut.action(states);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    sidebarState,
    logState,
    appState,
    tabState,
    showNotification,
    editorState,
    changeSetState,
    fs,
  ]);
}
