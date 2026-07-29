import type { ReactNode } from 'react';
import { useFileSystem } from '@/components/Storage';
import { makeAppState } from '@/test-utils/stateMocks';
import { makeFileSystemApi } from '@/test-utils/fsMocks';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { AppState } from './AppState';

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Mock dependencies that might be tricky
vi.mock('./Panes', () => {
  const SidebarState = ({ children }: { children?: ReactNode }) => <div data-testid="sidebar-state">{children}</div>;
  SidebarState.useState = vi.fn(() =>
    Object.assign(vi.fn(), {
      isSidebarOpen: true,
      folderTree: [],
      showAIInput: true,
      sidebarWidth: 260,
    }),
  );

  const TabState = ({ children }: { children?: ReactNode }) => <div data-testid="tabbar-state">{children}</div>;
  TabState.useState = vi.fn(() => Object.assign(vi.fn(), { openTabs: [], activeTabId: null }));
  TabState.usePassiveState = vi.fn(() =>
    Object.assign(vi.fn(), { openTabs: [], activeTabId: null }),
  );

  const PromptState = ({ children }: { children?: ReactNode }) => <div data-testid="prompt-state">{children}</div>;
  PromptState.useState = vi.fn(() =>
    Object.assign(vi.fn(), { promptWidth: 340, promptHistory: [] }),
  );
  PromptState.usePassiveState = vi.fn(() =>
    Object.assign(vi.fn(), { promptWidth: 340, promptHistory: [] }),
  );

  const PromptUiState = ({ children }: { children?: ReactNode }) => <div data-testid="prompt-ui-state">{children}</div>;
  PromptUiState.useState = vi.fn(() =>
    Object.assign(vi.fn(), { val: '', selectedModel: 'Qwen3.5-4B-q4f16_1-MLC' }),
  );
  PromptUiState.usePassiveState = vi.fn(() =>
    Object.assign(vi.fn(), { val: '', selectedModel: 'Qwen3.5-4B-q4f16_1-MLC' }),
  );

  return {
    Sidebar: () => <div data-testid="sidebar">Sidebar</div>,
    SidebarState,
    TopBar: () => <div data-testid="topbar">TopBar</div>,
    TabBar: () => <div data-testid="tabbar">TabBar</div>,
    TabState,
    StatusBar: () => <div data-testid="statusbar">StatusBar</div>,
    Prompt: () => <div data-testid="prompt">Prompt</div>,
    PromptState,
    PromptUiState,
  };
});

vi.mock('./Panes/Prompt/PromptState', () => ({
  PromptState: {
    useState: vi.fn(() => Object.assign(vi.fn(), { promptWidth: 340, promptHistory: [] })),
    usePassiveState: vi.fn(() => Object.assign(vi.fn(), { promptHistory: [] })),
  },
  PromptUiState: {
    useState: vi.fn(() =>
      Object.assign(vi.fn(), { val: '', selectedModel: 'Qwen3.5-4B-q4f16_1-MLC' }),
    ),
    usePassiveState: vi.fn(() =>
      Object.assign(vi.fn(), { val: '', selectedModel: 'Qwen3.5-4B-q4f16_1-MLC' }),
    ),
  },
  getInitialPromptUiState: vi.fn(() => ({
    val: '',
    selectedModel: 'Qwen3.5-4B-q4f16_1-MLC',
  })),
}));

vi.mock('@/components/AI/WebLLMState', () => ({
  WebLLMState: {
    useState: vi.fn(() => Object.assign(vi.fn(), { cachedModelIds: [], engines: {} })),
  },
  bindWebLLMStore: vi.fn(),
}));
vi.mock('@/components/AI/RagState', () => ({
  RagState: { useState: vi.fn(() => Object.assign(vi.fn(), { status: 'idle' })) },
}));
vi.mock('@/components/ui/Notification/Notification', () => ({
  NotificationState: {
    useState: vi.fn(() => Object.assign(vi.fn(), { notifications: [] })),
  },
  Notification: () => <div data-testid="notification" />,
  useNotification: vi.fn(() => ({ addNotification: vi.fn() })),
}));
vi.mock('./Views/EditorArea', () => {
  const State = ({ children }: { children?: ReactNode }) => <div data-testid="editor-state">{children}</div>;
  State.useState = vi.fn(() => Object.assign(vi.fn(), {}));
  State.usePassiveState = vi.fn(() => Object.assign(vi.fn(), {}));
  return {
    default: () => <div data-testid="editor">Editor</div>,
    EditorState: State,
  };
});

vi.mock('./Views/LogArea', () => {
  const State = ({ children }: { children?: ReactNode }) => <div data-testid="log-state">{children}</div>;
  State.useState = vi.fn(() => Object.assign(vi.fn(), { logs: [], isProcessing: false }));
  State.usePassiveState = vi.fn(() => Object.assign(vi.fn(), { logs: [], isProcessing: false }));
  return {
    default: () => <div data-testid="logs">Logs</div>,
    LogState: State,
  };
});

vi.mock('./PreviewState', () => {
  const State = ({ children }: { children?: ReactNode }) => <div data-testid="preview-state">{children}</div>;
  State.useState = vi.fn(() => Object.assign(vi.fn(), { htmlContent: '', isCompilerReady: false }));
  State.usePassiveState = vi.fn(() =>
    Object.assign(vi.fn(), { htmlContent: '', isCompilerReady: false }),
  );
  return {
    PreviewState: State,
  };
});

// Mock background services and sync hooks
vi.mock('@/components/AI/RagIndexer', () => ({ useRagIndexer: vi.fn() }));
vi.mock('@/components/App/keyboard/KeyboardHandler', () => ({ useKeyboardHandler: vi.fn() }));
vi.mock('@/components/App/Panes/TabBar/TabRestorer', () => ({ useTabRestorer: vi.fn() }));
vi.mock('@/components/App/Views/PreviewArea/PreviewRestorer', () => ({
  usePreviewRestorer: vi.fn(),
}));
vi.mock('@/components/Storage/ContentSaver', () => ({ useContentSaver: vi.fn() }));
vi.mock('@/components/Storage/SettingsSync', () => ({ useSettingsSync: vi.fn() }));
vi.mock('@/components/Storage/Settings', () => ({
  default: {
    hydrate: vi.fn(async () => true),
    getTemplate: vi.fn(() => 'default'),
    getFileContents: vi.fn(() => null),
    getPendingDiffs: vi.fn(() => ({})),
    getProjectName: vi.fn(() => 'Test'),
    getTheme: vi.fn(() => 'dark'),
    getOpenTabs: vi.fn(() => []),
    getActiveTabId: vi.fn(() => null),
    getLastCodeTabId: vi.fn(() => null),
    getAILogs: vi.fn(() => []),
    getSidebarWidth: vi.fn(() => 260),
    getPromptWidth: vi.fn(() => 340),
    getIsSidebarOpen: vi.fn(() => true),
    getShowAIInput: vi.fn(() => true),
    getExpandedFolders: vi.fn(() => ({})),
    getAICompletionEnabled: vi.fn(() => true),
    getEditorReadOnly: vi.fn(() => false),
    getPromptHistory: vi.fn(() => []),
    getPreviewHtml: vi.fn(() => null),
    getAgentSessions: vi.fn(() => null),
    getActiveAgentSessionId: vi.fn(() => null),
  },
}));
vi.mock('./WindowResize', () => ({ useWindowResize: vi.fn() }));

vi.mock('@/components/Storage', () => ({
  useFileSystem: vi.fn(() => ({
    mode: null,
    files: [],
    isReady: true,
    mountLocal: vi.fn(),
  })),
}));
vi.mock('@/components/ui/Notification', () => ({
  Notification: () => <div data-testid="notification" />,
  NotificationProvider: ({ children }: { children?: ReactNode }) => children,
  useNotification: vi.fn(() => ({
    addNotification: vi.fn(),
  })),
}));

describe('App', () => {
  it('renders all main components', async () => {
    const appStateMock = makeAppState({
      theme: 'dark',
      projectName: 'Test',
    });
    vi.spyOn(AppState, 'useState').mockReturnValue(appStateMock);
    render(<App />);
    expect(await screen.findByTestId('sidebar')).toBeDefined();
    expect(screen.getByTestId('topbar')).toBeDefined();
    expect(screen.getByTestId('tabbar')).toBeDefined();
    expect(screen.getByTestId('prompt')).toBeDefined();
  });

  it('renders AppLoading when fs is not ready', async () => {
    vi.mocked(useFileSystem).mockReturnValue(makeFileSystemApi({ isReady: false }) as ReturnType<typeof useFileSystem>);
    render(<App />);
    expect(await screen.findByText('Initializing workspace...')).toBeDefined();
  });
});
