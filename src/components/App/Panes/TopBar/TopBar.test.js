import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { PreviewState } from '@/components/App/PreviewState';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TopBar from './TopBar';

// Mock URL methods
global.URL.createObjectURL = vi.fn();
global.URL.revokeObjectURL = vi.fn();

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

vi.mock('@/components/Widgets/Tooltip/Tooltip', () => ({
  __esModule: true,
  default: ({ children, content }) => {
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

describe('TopBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockLogState = { isProcessing: false, logs: [] };
    LogState.useState.mockReturnValue(mockLogState);
    LogState.usePassiveState.mockReturnValue(mockLogState);
    PreviewState.useState.mockReturnValue({});
    PreviewState.usePassiveState.mockReturnValue({});
    TabState.usePassiveState.mockReturnValue({});
    AppState.usePassiveState.mockReturnValue({});
    SidebarState.usePassiveState.mockReturnValue({});
    EditorState.usePassiveState.mockReturnValue({});
  });

  it('renders breadcrumbs for an active file', () => {
    TabState.useState.mockReturnValue({
      openTabs: [
        {
          id: 'test.js',
          type: 'file',
          label: 'test.js',
          file: { path: ['src', 'test.js'], name: 'test.js' },
        },
      ],
      activeTabId: 'test.js',
    });
    AppState.useState.mockReturnValue({
      theme: 'dark',
      fs: { mode: null },
      projectName: 'Zakamurai',
    });
    SidebarState.useState.mockReturnValue({ folderTree: [] });
    EditorState.useState.mockReturnValue({ fileContents: {} });

    render(<TopBar />);
    expect(screen.getByText('src')).toBeDefined();
    expect(screen.getByText('test.js')).toBeDefined();
  });

  it('renders default breadcrumb when no active tab', () => {
    TabState.useState.mockReturnValue({
      openTabs: [],
      activeTabId: null,
    });
    AppState.useState.mockReturnValue({
      theme: 'dark',
      fs: { mode: null },
      projectName: 'Zakamurai',
    });
    SidebarState.useState.mockReturnValue({ folderTree: [] });
    EditorState.useState.mockReturnValue({ fileContents: {} });

    render(<TopBar />);
    expect(screen.getByText('Welcome')).toBeDefined();
  });

  it('renders the brand and toggles the sidebar from the top bar', () => {
    const stateUpdate = vi.fn();
    TabState.useState.mockReturnValue({
      openTabs: [],
      activeTabId: null,
    });
    AppState.useState.mockReturnValue({
      theme: 'dark',
      fs: { mode: null },
      projectName: 'Zakamurai',
    });
    SidebarState.useState.mockReturnValue(
      Object.assign(stateUpdate, {
        folderTree: [],
        isSidebarOpen: true,
        isSidebarPopupOpen: false,
      }),
    );
    EditorState.useState.mockReturnValue({ fileContents: {} });

    render(<TopBar />);
    expect(screen.getByText(/ZAKAMUR/i)).toBeDefined();

    fireEvent.click(screen.getByTestId('sidebar-toggle'));
    expect(stateUpdate).toHaveBeenCalled();
  });

  it('renders export button and handles click', async () => {
    TabState.useState.mockReturnValue({
      openTabs: [],
      activeTabId: null,
    });
    AppState.useState.mockReturnValue({
      theme: 'dark',
      fs: { mode: null },
      projectName: 'Test Project',
    });
    SidebarState.useState.mockReturnValue({ folderTree: [] });
    EditorState.useState.mockReturnValue({ fileContents: {} });

    render(<TopBar />);
    const menuBtn = screen.getByTitle('More actions');
    fireEvent.click(menuBtn);

    const exportBtn = await screen.findByText('Export ZIP');
    expect(exportBtn).toBeDefined();
  });

  it('renders compile button', () => {
    TabState.useState.mockReturnValue({
      openTabs: [],
      activeTabId: null,
    });
    AppState.useState.mockReturnValue({
      theme: 'dark',
      fs: { mode: null },
      projectName: 'Test Project',
    });
    SidebarState.useState.mockReturnValue({ folderTree: [] });
    EditorState.useState.mockReturnValue({ fileContents: {} });

    const { getByText } = render(<TopBar />);
    const compileBtn = getByText('Build');
    expect(compileBtn).toBeDefined();
  });

  it('renders new project button and handles click', async () => {
    TabState.useState.mockReturnValue({
      openTabs: [],
      activeTabId: null,
    });
    AppState.useState.mockReturnValue({
      theme: 'dark',
      fs: { mode: null },
      projectName: 'Test Project',
    });
    SidebarState.useState.mockReturnValue({ folderTree: [] });
    EditorState.useState.mockReturnValue({ fileContents: {} });

    render(<TopBar />);
    const menuBtn = screen.getByTitle('More actions');
    fireEvent.click(menuBtn);

    const newProjectBtn = await screen.findByText('New Project');
    expect(newProjectBtn).toBeDefined();
  });

  it('renders new project from scratch button and handles click', async () => {
    TabState.useState.mockReturnValue({
      openTabs: [],
      activeTabId: null,
    });
    AppState.useState.mockReturnValue({
      theme: 'dark',
      fs: { mode: null },
      projectName: 'Test Project',
    });
    SidebarState.useState.mockReturnValue({ folderTree: [] });
    EditorState.useState.mockReturnValue({ fileContents: {} });

    render(<TopBar />);
    const menuBtn = screen.getByTitle('More actions');
    fireEvent.click(menuBtn);

    const scratchBtn = await screen.findByText('New Project from Scratch');
    expect(scratchBtn).toBeDefined();
  });

  it('handles dynamic tooltips, history dropdown toggle, reverse order list, and clearing history', async () => {
    const editorStateUpdate = vi.fn();
    const editorStateMock = Object.assign(editorStateUpdate, {
      fileContents: {},
      navigationHistory: {
        stack: [
          { filePath: 'src/App.js', loc: { line: 10, col: 1 }, label: 'App.js' },
          { filePath: 'src/index.css', loc: { line: 20, col: 1 }, label: 'index.css' },
          { filePath: 'src/utils.js', loc: { line: 30, col: 1 }, label: 'utils.js' },
        ],
        currentIndex: 1,
      },
    });

    TabState.useState.mockReturnValue({
      openTabs: [],
      activeTabId: null,
    });
    AppState.useState.mockReturnValue({
      theme: 'dark',
      fs: { mode: null },
      projectName: 'Test Project',
    });
    SidebarState.useState.mockReturnValue({ folderTree: [] });
    EditorState.useState.mockReturnValue(editorStateMock);

    render(<TopBar />);

    // 1. Verify dynamic tooltips
    const backBtn = screen.getByTestId('go-back-button');
    const forwardBtn = screen.getByTestId('go-forward-button');
    expect(backBtn.getAttribute('title')).toBe('Go Back to App.js:10');
    expect(forwardBtn.getAttribute('title')).toBe('Go Forward to utils.js:30');

    // 2. Open History dropdown
    const historyBtn = screen.getByTestId('history-dropdown-button');
    expect(historyBtn).toBeDefined();
    fireEvent.click(historyBtn);

    // 3. Verify dropdown content rendered in reverse chronological order and overlay presence
    const dropdown = screen.getByTestId('history-dropdown');
    const overlay = screen.getByTestId('history-dropdown-overlay');
    expect(dropdown).toBeDefined();
    expect(overlay).toBeDefined();

    const items = screen.getAllByRole('menuitem');
    expect(items.length).toBe(3);
    // Index 2 (utils.js) is first in reverse order
    expect(items[0].textContent).toContain('utils.js');
    expect(items[0].textContent).toContain('L30');
    // Index 1 (index.css) is second
    expect(items[1].textContent).toContain('index.css');
    expect(items[1].textContent).toContain('L20');
    // Index 0 (App.js) is third
    expect(items[2].textContent).toContain('App.js');
    expect(items[2].textContent).toContain('L10');

    // Verify overlay click closes the dropdown
    fireEvent.click(overlay);
    expect(screen.queryByTestId('history-dropdown')).toBeNull();

    // Re-open dropdown to test clear history
    fireEvent.click(historyBtn);
    expect(screen.getByTestId('history-dropdown')).toBeDefined();

    // 4. Verify clearing history
    const clearBtn = screen.getByTestId('clear-history-button');
    expect(clearBtn).toBeDefined();
    fireEvent.click(clearBtn);

    expect(editorStateUpdate).toHaveBeenCalled();
  });
});
