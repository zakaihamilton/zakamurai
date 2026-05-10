import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { AppState } from './AppState';

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Mock dependencies that might be tricky
vi.mock('./Sidebar', () => {
  const State = ({ children }) => <div data-testid="sidebar-state">{children}</div>;
  State.useState = vi.fn(() =>
    Object.assign(vi.fn(), {
      isSidebarOpen: true,
      folderTree: [],
      showAIInput: true,
      sidebarWidth: 260,
    }),
  );
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
vi.mock('./Views/EditorArea', () => {
  const State = ({ children }) => <div data-testid="editor-state">{children}</div>;
  State.useState = vi.fn(() => Object.assign(vi.fn(), {}));
  return {
    default: () => <div data-testid="editor">Editor</div>,
    EditorState: State,
  };
});
vi.mock('./Views/LogArea', () => {
  const State = ({ children }) => <div data-testid="log-state">{children}</div>;
  State.useState = vi.fn(() => Object.assign(vi.fn(), { logs: [], isProcessing: false }));
  return {
    default: () => <div data-testid="logs">Logs</div>,
    LogState: State,
  };
});
vi.mock('./Prompt', () => {
  const State = ({ children }) => <div data-testid="prompt-state">{children}</div>;
  State.useState = vi.fn(() => Object.assign(vi.fn(), { promptWidth: 340 }));
  return {
    default: () => <div data-testid="prompt">Prompt</div>,
    PromptState: State,
  };
});
vi.mock('./PreviewState', () => {
  const State = ({ children }) => <div data-testid="preview-state">{children}</div>;
  State.useState = vi.fn(() => Object.assign(vi.fn(), { htmlContent: '', isCompilerReady: false }));
  return {
    PreviewState: State,
  };
});

// Mock subcomponents to avoid side effects and act warnings
vi.mock('./subcomponents/ContentSaver', () => ({ default: () => null }));
vi.mock('./subcomponents/KeyboardHandler', () => ({ default: () => null }));
vi.mock('./subcomponents/PreviewRestorer', () => ({ default: () => null }));
vi.mock('./subcomponents/ProjectNameSaver', () => ({ default: () => null }));
vi.mock('./subcomponents/TabRestorer', () => ({ default: () => null }));

vi.mock('@/components/Storage', () => ({
  useFileSystem: vi.fn(() => ({
    mode: null,
    files: [],
    isReady: true,
    mountLocal: vi.fn(),
  })),
}));
vi.mock('@/components/Widgets/Notification/Notification', () => ({
  Notification: () => <div data-testid="notification" />,
  NotificationProvider: ({ children }) => children,
  useNotification: vi.fn(() => ({
    addNotification: vi.fn(),
  })),
}));

describe('App', () => {
  it('renders all main components', () => {
    const appStateMock = Object.assign(vi.fn(), {
      theme: 'dark',
      fs: { mode: null, mountLocal: vi.fn() },
    });
    vi.spyOn(AppState, 'useState').mockReturnValue(appStateMock);
    render(<App />);
    expect(screen.getByTestId('sidebar')).toBeDefined();
    expect(screen.getByTestId('topbar')).toBeDefined();
    expect(screen.getByTestId('tabbar')).toBeDefined();
    expect(screen.getByTestId('prompt')).toBeDefined();
  });
});
