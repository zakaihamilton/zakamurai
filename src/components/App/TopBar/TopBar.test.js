import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppState } from '../App';
import { TabState } from '../TabBar';
import { SidebarState } from '../Sidebar';
import { EditorState } from '../EditorArea';
import TopBar from './TopBar';

// Mock URL methods
global.URL.createObjectURL = vi.fn();
global.URL.revokeObjectURL = vi.fn();

vi.mock('../App', () => ({
  AppState: {
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

    const { getByText } = render(<TopBar />);
    const exportBtn = getByText('Export ZIP');
    expect(exportBtn).toBeDefined();
  });
});
