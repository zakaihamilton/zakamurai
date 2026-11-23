import type { ShortcutDefinition } from '@/components/App/types';
import {
  clearLogsAction,
  closeAllTabsAction,
  closeCurrentTabAction,
  closeModalAction,
  navigateBackAction,
  navigateForwardAction,
  searchFilesAction,
  switchTabAction,
  toggleCssJsAction,
  toggleInspectModeAction,
} from './actions';
import { approveSaveShortcutAction, cancelChangesShortcutAction } from './changeReviewActions';
import { SHORTCUT_GROUPS } from './constants';
import { redoShortcutAction, undoShortcutAction } from './historyActions';

type ShortcutOpts = Omit<ShortcutDefinition, 'id' | 'group' | 'desc' | 'key' | 'displayKey'>;

const def = (
  id: string,
  group: string,
  desc: string,
  key: string | string[],
  displayKey: string,
  opts: ShortcutOpts = {},
): ShortcutDefinition => ({ id, group, desc, key, displayKey, ...opts });

const { NAVIGATION, EDITOR, AI, TABS, AI_PROMPT, GENERAL } = SHORTCUT_GROUPS;

export const SHORTCUTS: ShortcutDefinition[] = [
  def('navigate-back', NAVIGATION, 'Navigate Back', 'ArrowLeft', 'Alt+←', {
    modifier: 'alt',
    isGlobal: true,
    action: navigateBackAction,
  }),
  def('navigate-forward', NAVIGATION, 'Navigate Forward', 'ArrowRight', 'Alt+→', {
    modifier: 'alt',
    isGlobal: true,
    action: navigateForwardAction,
  }),
  def('navigate-back-cmd', NAVIGATION, 'Navigate Back', '[', '⌘[', {
    modifier: 'cmd',
    platform: 'mac',
    isGlobal: true,
    action: navigateBackAction,
  }),
  def('navigate-forward-cmd', NAVIGATION, 'Navigate Forward', ']', '⌘]', {
    modifier: 'cmd',
    platform: 'mac',
    isGlobal: true,
    action: navigateForwardAction,
  }),
  def('navigate-back-ctrl-win', NAVIGATION, 'Navigate Back', '[', 'Ctrl+[', {
    modifier: 'ctrl',
    platform: 'win',
    isGlobal: true,
    action: navigateBackAction,
  }),
  def('navigate-forward-ctrl-win', NAVIGATION, 'Navigate Forward', ']', 'Ctrl+]', {
    modifier: 'ctrl',
    platform: 'win',
    isGlobal: true,
    action: navigateForwardAction,
  }),
  def('toggle-css-js', NAVIGATION, 'Toggle between Component and CSS Module', 'b', '⌘B', {
    modifier: 'cmd',
    platform: 'mac',
    isGlobal: true,
    action: toggleCssJsAction,
  }),
  def('toggle-css-js-win', NAVIGATION, 'Toggle between Component and CSS Module', 'b', 'Alt+B', {
    modifier: 'alt',
    platform: 'win',
    isGlobal: true,
    action: toggleCssJsAction,
  }),
  def('toggle-sidebar', NAVIGATION, 'Toggle Sidebar', 'b', '⌃B', {
    modifier: 'ctrl',
    isGlobal: true,
    action: ({ sidebarState }) =>
      sidebarState((d) => {
        d.isSidebarOpen = !d.isSidebarOpen;
      }),
  }),
  def('toggle-ai-input', NAVIGATION, 'Toggle Agent', 'j', '⌃J', {
    modifier: 'ctrl',
    isGlobal: true,
    action: ({ sidebarState }) =>
      sidebarState((d) => {
        d.showAIInput = !d.showAIInput;
      }),
  }),
  def('show-logs', NAVIGATION, 'Goto Logs', 'u', '⌃U', {
    modifier: 'ctrl',
    isGlobal: true,
    action: ({ tabState }) =>
      tabState((d) => {
        d.activeTabId = 'ai-logs';
      }),
  }),
  def('show-preview', NAVIGATION, 'Goto Preview', 'i', '⌃I', {
    modifier: 'ctrl',
    isGlobal: true,
    action: ({ tabState }) =>
      tabState((d) => {
        d.activeTabId = 'preview';
      }),
  }),
  def('search-files', NAVIGATION, 'Search Files', 'p', '⌃P', {
    modifier: 'ctrl',
    isGlobal: true,
    action: searchFilesAction,
  }),
  def('toggle-inspect-mode', EDITOR, 'Toggle Inspect Mode (ReadOnly/Writable)', 'e', '⌃E', {
    modifier: 'ctrl',
    isGlobal: true,
    action: toggleInspectModeAction,
  }),
  def('undo', EDITOR, 'Undo', 'z', '⌘Z', {
    modifier: 'cmd',
    isGlobal: true,
    action: undoShortcutAction,
  }),
  def('redo', EDITOR, 'Redo', 'z', '⌘⇧Z', {
    modifier: 'cmd-shift',
    isGlobal: true,
    action: redoShortcutAction,
  }),
  def('redo-y', EDITOR, 'Redo', 'y', '⌘Y', {
    modifier: 'cmd',
    isGlobal: true,
    action: redoShortcutAction,
  }),
  def('build-project', EDITOR, 'Build Project', 'Enter', '⌘↵', {
    modifier: 'cmd',
    isGlobal: true,
    action: ({ appState }) =>
      appState((d) => {
        d.compileRequest = (d.compileRequest || 0) + 1;
      }),
  }),
  def('build-project-silent', EDITOR, 'Build Project (Stay on Page)', 'Enter', '⌘⇧↵', {
    modifier: 'cmd-shift',
    isGlobal: true,
    action: ({ appState }) =>
      appState((d) => {
        d.silentCompileRequest = (d.silentCompileRequest || 0) + 1;
      }),
  }),
  def('indent', EDITOR, 'Indent Selection', 'Tab', 'Tab', { modifier: 'none', isGlobal: false }),
  def('outdent', EDITOR, 'Outdent Selection', 'Tab', '⇧Tab', {
    modifier: 'shift',
    isGlobal: false,
  }),
  def('toggle-comment', EDITOR, 'Toggle Line Comment', '/', '⌘/', {
    modifier: 'cmd',
    isGlobal: false,
  }),
  def('jump-to-line', EDITOR, 'Jump to Line', 'g', '⌃G', { modifier: 'ctrl', isGlobal: false }),
  def('format-code', EDITOR, 'Format Code', 'f', '⌃⇧F', {
    modifier: 'ctrl-shift',
    isGlobal: false,
  }),
  def('approve-save', AI, 'Approve & Save Changes', 's', '⌘S', {
    modifier: 'cmd',
    isGlobal: true,
    action: approveSaveShortcutAction,
  }),
  def('cancel-changes', AI, 'Cancel AI Changes', ['.', 'Backspace'], '⌘. / ⌘⌫', {
    modifier: 'cmd',
    isGlobal: true,
    action: cancelChangesShortcutAction,
  }),
  def('show-ai-completion-debug', AI, 'Show AI Completion Debug', 'c', '⌃⇧C', {
    modifier: 'ctrl-shift',
    isGlobal: true,
    action: ({ appState }) =>
      appState((d) => {
        d.showCompletionDebug = !d.showCompletionDebug;
      }),
  }),
  def('accept-ai-completion', AI, 'Accept Full AI Suggestion', 'Tab', 'Tab', {
    modifier: 'none',
    isGlobal: false,
  }),
  def(
    'accept-ai-completion-word-mac',
    AI,
    'Accept Next Word of AI Suggestion',
    'ArrowRight',
    '⌘→',
    {
      modifier: 'cmd',
      platform: 'mac',
      isGlobal: false,
    },
  ),
  def(
    'accept-ai-completion-word-win',
    AI,
    'Accept Next Word of AI Suggestion',
    'ArrowRight',
    'Ctrl+→',
    { modifier: 'ctrl', platform: 'win', isGlobal: false },
  ),
  def('dismiss-ai-completion', AI, 'Dismiss AI Suggestion / Stop Thinking', 'Escape', 'Esc', {
    modifier: 'none',
    isGlobal: false,
  }),
  def('close-current-tab', TABS, 'Close Current Tab', 'w', '⌃W', {
    modifier: 'ctrl',
    isGlobal: true,
    action: closeCurrentTabAction,
  }),
  def('next-tab', TABS, 'Next Tab', 't', '⌃T', {
    modifier: 'ctrl',
    isGlobal: true,
    action: (states) => switchTabAction(states, 1),
  }),
  def('previous-tab', TABS, 'Previous Tab', 't', '⌃⇧T', {
    modifier: 'ctrl-shift',
    isGlobal: true,
    action: (states) => switchTabAction(states, -1),
  }),
  def('close-all-tabs', TABS, 'Close All Tabs', 'w', '⌃⇧W', {
    modifier: 'ctrl-shift',
    isGlobal: true,
    action: closeAllTabsAction,
  }),
  def('execute-prompt', AI_PROMPT, 'Execute Prompt', 'Enter', '↵', {
    modifier: 'none',
    isGlobal: false,
  }),
  def('insert-newline', AI_PROMPT, 'Insert Newline', 'Enter', '⌘↵', {
    modifier: 'cmd',
    isGlobal: false,
  }),
  def('stop-ai', AI_PROMPT, 'Stop AI Generation', '.', '⌘.', { modifier: 'cmd', isGlobal: false }),
  def('show-shortcuts', GENERAL, 'Show Keyboard Shortcuts', 'k', '⌃⇧K', {
    modifier: 'ctrl-shift',
    isGlobal: true,
    action: ({ appState }) =>
      appState((d) => {
        d.showShortcuts = !d.showShortcuts;
      }),
  }),
  def('clear-logs', GENERAL, 'Clear Logs (in Log Area)', 'k', '⌃K', {
    modifier: 'ctrl',
    isGlobal: true,
    action: clearLogsAction,
  }),
  def('toggle-theme', GENERAL, 'Toggle Theme', 'l', '⌃L', {
    modifier: 'ctrl',
    isGlobal: true,
    action: ({ appState }) =>
      appState((d) => {
        d.theme = d.theme === 'light' ? 'dark' : 'light';
      }),
  }),
  def('close-modal', GENERAL, 'Close Modal / Cancel', 'Escape', 'Esc', {
    modifier: 'none',
    isGlobal: true,
    action: closeModalAction,
  }),
];
