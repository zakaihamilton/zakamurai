import { AppState } from '@/components/App/AppState';
import { PromptUiState } from '@/components/App/Panes/Prompt/PromptState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { PreviewState } from '@/components/App/PreviewState';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { DEFAULT_CONTENTS, DEFAULT_FILES } from '@/components/Storage/InitialData';
import Settings from '@/components/Storage/Settings';
import { createMockEditorState } from '@/test-utils/editorMocks';
import {
  makeAppState,
  makeEditorState,
  makeLogState,
  makePreviewState,
  makePromptUiState,
  makeSidebarState,
  makeTabState,
} from '@/test-utils/stateMocks';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TopBar, { resetNewProjectState } from './TopBar';

global.URL.createObjectURL = vi.fn();
global.URL.revokeObjectURL = vi.fn();

vi.mock('./ProjectCompiler', () => ({
  default: vi.fn(() => ({
    handleCompile: vi.fn(),
    handleOpenLog: vi.fn(),
    handleOpenPreview: vi.fn(),
    handleClearFS: vi.fn(),
  })),
}));

vi.mock('./ZipExporter', () => ({
  default: vi.fn(() => ({
    handleExportZip: vi.fn(),
    handleExportCompiledZip: vi.fn(),
  })),
}));

vi.mock('@/components/Storage', () => ({
  useFileSystem: vi.fn(() => ({ mode: null, unlinkProject: vi.fn() })),
}));

vi.mock('@/components/App/AppState', () => ({
  AppState: {
    useState: vi.fn(),
    usePassiveState: vi.fn(),
  },
}));

vi.mock('@/components/App/PreviewState', () => ({
  PreviewState: {
    useState: vi.fn(),
    usePassiveState: vi.fn(),
  },
}));

vi.mock('@/components/ui/Tooltip', () => ({
  __esModule: true,
  default: ({
    children,
    content,
  }: { children: ReactElement<{ title?: ReactNode }>; content: ReactNode }) => {
    return React.cloneElement(children, { title: content });
  },
}));

vi.mock('@/components/App/Views/LogArea', () => ({
  LogState: {
    useState: vi.fn(),
    usePassiveState: vi.fn(),
  },
}));

vi.mock('@/components/App/Panes/TabBar', () => ({
  TabState: {
    useState: vi.fn(),
    usePassiveState: vi.fn(),
  },
}));

vi.mock('@/components/App/Panes/Sidebar', () => ({
  SidebarState: {
    useState: vi.fn(),
    usePassiveState: vi.fn(),
  },
}));

vi.mock('@/components/App/Views/EditorArea', () => ({
  EditorState: {
    useState: vi.fn(),
    usePassiveState: vi.fn(),
  },
}));

vi.mock('@/components/App/Panes/Prompt/PromptState', () => ({
  PromptUiState: {
    useState: vi.fn(),
    usePassiveState: vi.fn(),
  },
  PromptState: {
    useState: vi.fn(),
    usePassiveState: vi.fn(),
  },
}));

describe('TopBar', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    const mockLogState = makeLogState();
    vi.mocked(LogState.useState).mockReturnValue(mockLogState);
    vi.mocked(LogState.usePassiveState).mockReturnValue(mockLogState);
    vi.mocked(PreviewState.useState).mockReturnValue(makePreviewState());
    vi.mocked(PreviewState.usePassiveState).mockReturnValue(makePreviewState());
    vi.mocked(TabState.usePassiveState).mockReturnValue(makeTabState());
    vi.mocked(AppState.usePassiveState).mockReturnValue(makeAppState());
    vi.mocked(SidebarState.usePassiveState).mockReturnValue(makeSidebarState());
    vi.mocked(EditorState.usePassiveState).mockReturnValue(
      createMockEditorState() as ReturnType<typeof EditorState.usePassiveState>,
    );
    vi.mocked(PromptUiState.usePassiveState).mockReturnValue(makePromptUiState());
  });

  function setupCommonMocks({
    projectName = 'Zakamurai',
    tabState = makeTabState(),
    sidebarState = makeSidebarState(),
    editorState = createMockEditorState({ fileContents: {} }) as ReturnType<
      typeof EditorState.useState
    >,
  }: {
    projectName?: string;
    tabState?: ReturnType<typeof makeTabState>;
    sidebarState?: ReturnType<typeof makeSidebarState>;
    editorState?: ReturnType<typeof EditorState.useState>;
  } = {}) {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ theme: 'dark', projectName }));
    vi.mocked(TabState.useState).mockReturnValue(tabState);
    vi.mocked(SidebarState.useState).mockReturnValue(sidebarState);
    vi.mocked(EditorState.useState).mockReturnValue(editorState);
  }

  it('renders breadcrumbs for an active file', () => {
    setupCommonMocks({
      tabState: makeTabState({
        openTabs: [
          {
            id: 'test.js',
            type: 'file',
            label: 'test.js',
            file: { path: ['src', 'test.js'], name: 'test.js' },
          },
        ],
        activeTabId: 'test.js',
        lastCodeTabId: 'test.js',
      }),
    });

    render(<TopBar />);
    expect(screen.getByText('src')).toBeDefined();
    expect(screen.getByText('test.js')).toBeDefined();
  });

  it('renders default breadcrumb when no active tab', () => {
    setupCommonMocks({
      tabState: makeTabState({ openTabs: [], activeTabId: null }),
    });

    render(<TopBar />);
    expect(screen.getByText('Welcome')).toBeDefined();
  });

  it('renders the brand and toggles the sidebar from the top bar', () => {
    const sidebarState = makeSidebarState({
      folderTree: [],
      isSidebarOpen: true,
      isSidebarPopupOpen: false,
    });
    setupCommonMocks({
      tabState: makeTabState({ openTabs: [], activeTabId: null }),
      sidebarState,
    });

    render(<TopBar />);
    expect(screen.getByText(/ZAKAMUR/i)).toBeDefined();

    fireEvent.click(screen.getByTestId('sidebar-toggle'));
    expect(sidebarState).toHaveBeenCalled();
  });

  it('renders export button and handles click', async () => {
    setupCommonMocks({
      projectName: 'Test Project',
      tabState: makeTabState({ openTabs: [], activeTabId: null }),
    });

    render(<TopBar />);
    fireEvent.click(screen.getByTitle('More actions'));
    expect(await screen.findByText('Export ZIP')).toBeDefined();
  });

  it('renders compile button', () => {
    setupCommonMocks({
      projectName: 'Test Project',
      tabState: makeTabState({ openTabs: [], activeTabId: null }),
    });

    render(<TopBar />);
    expect(screen.getByText('Build')).toBeDefined();
  });

  it('opens the last non-log and non-preview tab from the view group', () => {
    const tabState = makeTabState({
      openTabs: [
        {
          id: 'src/App.js',
          type: 'file',
          label: 'App.js',
          file: { path: ['src', 'App.js'], name: 'App.js' },
        },
        { id: 'ai-logs', type: 'logs', label: 'Logs' },
        { id: 'preview', type: 'preview', label: 'Preview' },
      ],
      activeTabId: 'src/App.js',
    });
    setupCommonMocks({ projectName: 'Test Project', tabState });

    const { rerender } = render(<TopBar />);
    tabState.activeTabId = 'ai-logs';
    rerender(<TopBar />);
    fireEvent.click(screen.getByTestId('code-tab'));

    expect(tabState).toHaveBeenCalled();
    expect(tabState.activeTabId).toBe('src/App.js');
  });

  it('disables the code tab button when no content tab has been used', () => {
    setupCommonMocks({
      projectName: 'Test Project',
      tabState: makeTabState({
        openTabs: [
          { id: 'ai-logs', type: 'logs', label: 'Logs' },
          { id: 'preview', type: 'preview', label: 'Preview' },
        ],
        activeTabId: 'preview',
      }),
    });

    render(<TopBar />);
    expect(screen.getByTestId('code-tab')).toBeDisabled();
  });

  it('uses the saved last code tab after a reload', () => {
    const tabState = makeTabState({
      openTabs: [
        {
          id: 'src/App.js',
          type: 'file',
          label: 'App.js',
          file: { path: ['src', 'App.js'], name: 'App.js' },
        },
        { id: 'preview', type: 'preview', label: 'Preview' },
      ],
      activeTabId: 'preview',
      lastCodeTabId: 'src/App.js',
    });
    setupCommonMocks({ projectName: 'Test Project', tabState });

    render(<TopBar />);
    fireEvent.click(screen.getByTestId('code-tab'));
    expect(tabState.activeTabId).toBe('src/App.js');
  });

  it('renders new project button and handles click', async () => {
    setupCommonMocks({
      projectName: 'Test Project',
      tabState: makeTabState({ openTabs: [], activeTabId: null }),
    });

    render(<TopBar />);
    fireEvent.click(screen.getByTitle('More actions'));
    expect(await screen.findByText('New Project')).toBeDefined();
  });

  it('renders new project from scratch button and handles click', async () => {
    setupCommonMocks({
      projectName: 'Test Project',
      tabState: makeTabState({ openTabs: [], activeTabId: null }),
    });

    render(<TopBar />);
    fireEvent.click(screen.getByTitle('More actions'));
    expect(await screen.findByText('New Project from Scratch')).toBeDefined();
  });

  it('resets live file state before reloading for a new project', () => {
    const appState = makeAppState({ theme: 'dark', projectName: 'Old Project' });
    const sidebarState = makeSidebarState({
      folderTree: [{ name: 'old.js', type: 'file', path: ['old.js'] }],
      isSidebarOpen: true,
    });
    const tabState = makeTabState({
      openTabs: [{ id: 'old.js', type: 'file', label: 'old.js' }],
      activeTabId: 'old.js',
    });
    const editorState = createMockEditorState({
      fileContents: { 'old.js': 'old content' },
      pendingDiffs: {
        'old.js': { originalContent: 'older content', modifiedContent: '', diffs: [] },
      },
    });
    const previewState = makePreviewState({ htmlContent: '<p>old</p>' });
    const promptUiState = makePromptUiState({ val: 'draft', draftVal: 'draft', historyIndex: 0 });

    Settings.reset('default');
    resetNewProjectState({
      template: 'default',
      appState,
      sidebarState,
      tabState,
      editorState,
      previewState,
      promptUiState,
    });

    expect(appState.projectName).toBe('My App');
    expect(sidebarState.folderTree).toBe(DEFAULT_FILES);
    expect(tabState.openTabs).toEqual([]);
    expect(tabState.activeTabId).toBeNull();
    expect(editorState.fileContents).toBe(DEFAULT_CONTENTS);
    expect(editorState.pendingDiffs).toEqual({});
    expect(previewState.htmlContent).toBeNull();
    expect(promptUiState.val).toBe('');
  });

  it('handles dynamic tooltips, history dropdown toggle, reverse order list, and clearing history', async () => {
    const editorState = createMockEditorState({
      fileContents: {},
      navigationHistory: {
        stack: [
          { filePath: 'src/App.js', loc: { line: 10, col: 1, index: 0 }, label: 'App.js' },
          { filePath: 'src/index.css', loc: { line: 20, col: 1, index: 0 }, label: 'index.css' },
          { filePath: 'src/utils.js', loc: { line: 30, col: 1, index: 0 }, label: 'utils.js' },
        ],
        currentIndex: 1,
      },
    });

    setupCommonMocks({
      projectName: 'Test Project',
      tabState: makeTabState({ openTabs: [], activeTabId: null }),
      editorState: editorState as ReturnType<typeof EditorState.useState>,
    });

    render(<TopBar />);

    const backBtn = screen.getByTestId('go-back-button');
    const forwardBtn = screen.getByTestId('go-forward-button');
    expect(backBtn.getAttribute('title')).toBe('Go Back to App.js:10');
    expect(forwardBtn.getAttribute('title')).toBe('Go Forward to utils.js:30');

    fireEvent.click(screen.getByTestId('history-dropdown-button'));

    const dropdown = screen.getByTestId('history-dropdown');
    const overlay = screen.getByTestId('history-dropdown-overlay');
    expect(dropdown).toBeDefined();
    expect(overlay).toBeDefined();

    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(3);
    expect(items[0]!.textContent).toContain('utils.js');
    expect(items[0]!.textContent).toContain('L30');
    expect(items[1]!.textContent).toContain('index.css');
    expect(items[1]!.textContent).toContain('L20');
    expect(items[2]!.textContent).toContain('App.js');
    expect(items[2]!.textContent).toContain('L10');

    fireEvent.click(overlay);
    expect(screen.queryByTestId('history-dropdown')).toBeNull();

    fireEvent.click(screen.getByTestId('history-dropdown-button'));
    expect(screen.getByTestId('history-dropdown')).toBeDefined();

    fireEvent.click(screen.getByTestId('clear-history-button'));
    expect(editorState).toHaveBeenCalled();
  });
});
