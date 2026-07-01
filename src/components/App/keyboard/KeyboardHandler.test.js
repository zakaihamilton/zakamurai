import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { useNotification } from '@/components/ui/Notification';
import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardHandler } from './KeyboardHandler';
import { SHORTCUT_HIGHLIGHT_EVENT } from './Shortcuts';

function TestComponent() {
  useKeyboardHandler();
  return null;
}

vi.mock('@/components/App/AppState', () => ({
  AppState: { useState: vi.fn() },
}));
vi.mock('@/components/App/Panes/Sidebar', () => ({
  SidebarState: { useState: vi.fn() },
}));
vi.mock('@/components/App/Panes/TabBar', () => ({
  TabState: { useState: vi.fn() },
}));
vi.mock('@/components/App/Views/EditorArea', () => ({
  EditorState: { useState: vi.fn() },
}));
vi.mock('@/components/App/Views/LogArea', () => ({
  LogState: { useState: vi.fn() },
}));
vi.mock('@/components/ui/Notification', () => ({
  useNotification: vi.fn(),
}));
vi.mock('@/utils/keyboard', () => ({
  markKeyboardActivity: vi.fn(),
}));
vi.mock('@/utils/os', () => ({
  isMac: vi.fn(() => true),
}));

import { markKeyboardActivity } from '@/utils/keyboard';

describe('KeyboardHandler', () => {
  let sidebarState;
  let tabState;
  let appState;
  let logState;
  let editorState;
  let addNotification;

  beforeEach(() => {
    sidebarState = vi.fn();
    sidebarState.isSidebarOpen = true;

    tabState = vi.fn();
    tabState.activeTabId = 'test.js';

    appState = vi.fn();
    appState.fs = { mode: 'local' };
    appState.showShortcuts = false;

    logState = vi.fn();
    editorState = vi.fn();
    addNotification = vi.fn();

    SidebarState.useState.mockReturnValue(sidebarState);
    TabState.useState.mockReturnValue(tabState);
    AppState.useState.mockReturnValue(appState);
    LogState.useState.mockReturnValue(logState);
    EditorState.useState.mockReturnValue(editorState);
    useNotification.mockReturnValue({ addNotification });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('toggles sidebar on Ctrl+B', () => {
    render(<TestComponent />);

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });

    expect(sidebarState).toHaveBeenCalled();
    const updateFn = sidebarState.mock.calls[0][0];
    const draft = { isSidebarOpen: true };
    updateFn(draft);
    expect(draft.isSidebarOpen).toBe(false);
  });

  it('shows logs on Ctrl+U', () => {
    render(<TestComponent />);

    fireEvent.keyDown(window, { key: 'u', ctrlKey: true });

    expect(tabState).toHaveBeenCalled();
    const updateFn = tabState.mock.calls[0][0];
    const draft = { activeTabId: 'test.js' };
    updateFn(draft);
    expect(draft.activeTabId).toBe('ai-logs');
  });

  it('saves project on Cmd+S', () => {
    render(<TestComponent />);

    fireEvent.keyDown(window, { key: 's', metaKey: true });

    expect(addNotification).toHaveBeenCalledWith('Project saved', 'success');
  });

  it('does not trigger shortcut if repeat is true', () => {
    render(<TestComponent />);

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true, repeat: true });

    expect(sidebarState).not.toHaveBeenCalled();
  });

  it('highlights matching shortcut instead of triggering actions while shortcuts help is visible', () => {
    appState.showShortcuts = true;
    const highlightHandler = vi.fn();
    window.addEventListener(SHORTCUT_HIGHLIGHT_EVENT, highlightHandler);
    render(<TestComponent />);

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });

    expect(sidebarState).not.toHaveBeenCalled();
    expect(highlightHandler).toHaveBeenCalledTimes(1);
    expect(highlightHandler.mock.calls[0][0].detail).toEqual({ shortcutId: 'toggle-sidebar' });

    window.removeEventListener(SHORTCUT_HIGHLIGHT_EVENT, highlightHandler);
  });

  it('highlights Shift+Tab while shortcuts help is visible', () => {
    appState.showShortcuts = true;
    const highlightHandler = vi.fn();
    window.addEventListener(SHORTCUT_HIGHLIGHT_EVENT, highlightHandler);
    render(<TestComponent />);

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });

    expect(highlightHandler).toHaveBeenCalledTimes(1);
    expect(highlightHandler.mock.calls[0][0].detail).toEqual({ shortcutId: 'outdent' });

    window.removeEventListener(SHORTCUT_HIGHLIGHT_EVENT, highlightHandler);
  });

  it('closes shortcuts help on Escape instead of highlighting the close shortcut', () => {
    appState.showShortcuts = true;
    const highlightHandler = vi.fn();
    window.addEventListener(SHORTCUT_HIGHLIGHT_EVENT, highlightHandler);
    render(<TestComponent />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(highlightHandler).not.toHaveBeenCalled();
    expect(appState).toHaveBeenCalled();
    const updateFn = appState.mock.calls[0][0];
    const draft = { showShortcuts: true };
    updateFn(draft);
    expect(draft.showShortcuts).toBe(false);

    window.removeEventListener(SHORTCUT_HIGHLIGHT_EVENT, highlightHandler);
  });

  it('ignores shortcuts if composing', () => {
    render(<TestComponent />);

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true, isComposing: true });

    expect(markKeyboardActivity).not.toHaveBeenCalled();
  });

  it('ignores navigation shortcuts if input/textarea is focused', () => {
    render(<TestComponent />);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(input, { key: 'ArrowLeft', altKey: true });

    expect(editorState).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
