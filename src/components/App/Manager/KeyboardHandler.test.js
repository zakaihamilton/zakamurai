import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { useNotification } from '@/components/Widgets/Notification/Notification';
import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KeyboardHandler from './KeyboardHandler';

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
vi.mock('@/components/Widgets/Notification/Notification', () => ({
  useNotification: vi.fn(),
}));
vi.mock('@/utils/os', () => ({
  isMac: vi.fn(() => true), // Mock as Mac for test consistency
}));

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

  it('toggles sidebar on Cmd+B', () => {
    render(<KeyboardHandler />);

    fireEvent.keyDown(window, { key: 'b', metaKey: true });

    expect(sidebarState).toHaveBeenCalled();
    const updateFn = sidebarState.mock.calls[0][0];
    const draft = { isSidebarOpen: true };
    updateFn(draft);
    expect(draft.isSidebarOpen).toBe(false);
  });

  it('shows logs on Cmd+U', () => {
    render(<KeyboardHandler />);

    fireEvent.keyDown(window, { key: 'u', metaKey: true });

    expect(tabState).toHaveBeenCalled();
    const updateFn = tabState.mock.calls[0][0];
    const draft = { activeTabId: 'test.js' };
    updateFn(draft);
    expect(draft.activeTabId).toBe('ai-logs');
  });

  it('saves project on Cmd+S', () => {
    render(<KeyboardHandler />);

    fireEvent.keyDown(window, { key: 's', metaKey: true });

    expect(addNotification).toHaveBeenCalledWith('Project saved', 'success');
  });

  it('does not trigger shortcut if repeat is true', () => {
    render(<KeyboardHandler />);

    fireEvent.keyDown(window, { key: 'b', metaKey: true, repeat: true });

    expect(sidebarState).not.toHaveBeenCalled();
  });
});
