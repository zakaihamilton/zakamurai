import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppState, PreviewState } from '../App';
import { EditorState } from '../EditorArea';
import { LogState } from '../LogArea';
import { SidebarState } from '../Sidebar';
import { TabState } from '../TabBar';
import TopBar from './TopBar';

// Mock URL methods
global.URL.createObjectURL = vi.fn();
global.URL.revokeObjectURL = vi.fn();

vi.mock('../App', () => ({
  AppState: {
    useState: vi.fn(),
  },
  PreviewState: {
    useState: vi.fn(),
  },
}));

vi.mock('../../Widgets/Tooltip/Tooltip', () => ({
  __esModule: true,
  default: ({ children, content }) => {
    return React.cloneElement(children, { title: content });
  },
}));

vi.mock('../LogArea', () => ({
  LogState: {
    useState: vi.fn(),
  },
}));

vi.mock('../TabBar', () => ({
  TabState: {
    useState: vi.fn(),
  },
}));

vi.mock('../Sidebar', () => ({
  SidebarState: {
    useState: vi.fn(),
  },
}));

vi.mock('../EditorArea', () => ({
  EditorState: {
    useState: vi.fn(),
  },
}));

describe('TopBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    LogState.useState.mockReturnValue({ isProcessing: false, logs: [] });
    PreviewState.useState.mockReturnValue({});
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
    expect(screen.getByText('Zakamurai')).toBeDefined();
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

    const exportBtn = screen.getByText('Export ZIP');
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
    const compileBtn = getByText('Compile');
    expect(compileBtn).toBeDefined();
  });
});
