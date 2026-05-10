import { SidebarState } from '@/components/App/Sidebar';
import { TabState } from '@/components/App/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppState } from '../AppState';
import { PreviewState } from '../PreviewState';
import TopBar from './TopBar';

// Mock URL methods
global.URL.createObjectURL = vi.fn();
global.URL.revokeObjectURL = vi.fn();

vi.mock('@/components/App/AppState', () => ({
  AppState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/App/PreviewState', () => ({
  PreviewState: {
    useState: vi.fn(),
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
  },
}));

vi.mock('@/components/App/TabBar', () => ({
  TabState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/App/Sidebar', () => ({
  SidebarState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/App/Views/EditorArea', () => ({
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
    expect(screen.getByText('Dashboard')).toBeDefined();
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
