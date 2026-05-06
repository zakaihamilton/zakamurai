import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppState } from '../App';
import { TabState } from '../TabBar';
import { SidebarState } from '../Sidebar';
import TopBar from './TopBar';

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
    AppState.useState.mockReturnValue({ theme: 'dark' });
    SidebarState.useState.mockReturnValue({});

    render(<TopBar />);
    expect(screen.getByText('src')).toBeDefined();
    expect(screen.getByText('test.js')).toBeDefined();
  });

  it('renders default breadcrumb when no active tab', () => {
    TabState.useState.mockReturnValue({
      openTabs: [],
      activeTabId: null,
    });
    AppState.useState.mockReturnValue({ theme: 'dark' });
    SidebarState.useState.mockReturnValue({});

    render(<TopBar />);
    expect(screen.getByText('Zakamurai')).toBeDefined();
  });
});
