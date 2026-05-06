import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App, { AppState } from './App';

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Mock dependencies that might be tricky
vi.mock('./Sidebar', () => {
  const State = ({ children }) => <div data-testid="sidebar-state">{children}</div>;
  State.useState = vi.fn(() => Object.assign(vi.fn(), { isSidebarOpen: true, folderTree: [], showAIInput: true }));
  return {
    default: () => <div data-testid="sidebar">Sidebar</div>,
    SidebarState: State,
  };
});
vi.mock('./TopBar', () => ({ default: () => <div data-testid="topbar">TopBar</div> }));
vi.mock('./TabBar', () => {
  const State = ({ children }) => <div data-testid="tabbar-state">{children}</div>;
  State.useState = vi.fn(() => Object.assign(vi.fn(), { openTabs: [], activeTabId: null }));
  return {
    default: () => <div data-testid="tabbar">TabBar</div>,
    TabState: State,
  };
});
vi.mock('./EditorArea', () => {
  const State = ({ children }) => <div data-testid="editor-state">{children}</div>;
  State.useState = vi.fn(() => Object.assign(vi.fn(), {}));
  return {
    default: () => <div data-testid="editor">Editor</div>,
    EditorState: State,
  };
});
vi.mock('./LogArea', () => {
  const State = ({ children }) => <div data-testid="log-state">{children}</div>;
  State.useState = vi.fn(() => Object.assign(vi.fn(), { logs: [], isProcessing: false }));
  return {
    default: () => <div data-testid="logs">Logs</div>,
    LogState: State,
  };
});
vi.mock('./PromptFooter', () => ({
  default: () => <div data-testid="footer">Footer</div>,
}));

describe('App', () => {
  it('renders all main components', () => {
    const appStateMock = Object.assign(vi.fn(), { theme: 'dark' });
    vi.spyOn(AppState, 'useState').mockReturnValue(appStateMock);
    render(<App />);
    expect(screen.getByTestId('sidebar')).toBeDefined();
    expect(screen.getByTestId('topbar')).toBeDefined();
    expect(screen.getByTestId('tabbar')).toBeDefined();
    expect(screen.getByTestId('footer')).toBeDefined();
  });
});
