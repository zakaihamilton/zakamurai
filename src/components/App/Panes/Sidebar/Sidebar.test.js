import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarState } from './Sidebar';
import Sidebar from './Sidebar';

// Mock the state
vi.mock('@/components/App/AppState', () => ({
  AppState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/App/Panes/TabBar', () => ({
  TabState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/App/Views/EditorArea', () => ({
  EditorState: {
    useState: vi.fn(),
  },
}));

describe('Sidebar', () => {
  const folderTree = [
    {
      name: 'src',
      type: 'folder',
      children: [
        {
          name: 'components',
          type: 'folder',
          children: [
            { name: 'AnimatedCard.jsx', type: 'file' },
            { name: 'Icons.jsx', type: 'file' },
          ],
        },
        { name: 'App.jsx', type: 'file' },
      ],
    },
    { name: 'package.json', type: 'file' },
  ];

  it('renders the project name', () => {
    vi.spyOn(SidebarState, 'useState').mockReturnValue({
      isSidebarOpen: true,
      folderTree: [],
      showAIInput: true,
    });
    vi.spyOn(AppState, 'useState').mockReturnValue({
      projectName: 'Test Project',
      fs: { mode: null, mountLocal: vi.fn() },
    });
    vi.spyOn(TabState, 'useState').mockReturnValue({
      activeTabId: null,
    });
    vi.spyOn(EditorState, 'useState').mockReturnValue({});

    render(<Sidebar />);
    expect(screen.getByText('Test Project')).toBeDefined();
    expect(screen.getByText(/ZAKAMUR/i)).toBeDefined();
    expect(screen.getByText(/AI/i)).toBeDefined();
  });

  it('toggles the sidebar when the logo is clicked', () => {
    const stateUpdate = vi.fn();
    vi.spyOn(SidebarState, 'useState').mockReturnValue(
      Object.assign(stateUpdate, {
        isSidebarOpen: true,
        folderTree: [],
        showAIInput: true,
      }),
    );
    vi.spyOn(AppState, 'useState').mockReturnValue({
      projectName: 'Test Project',
      fs: { mode: null, mountLocal: vi.fn() },
    });
    vi.spyOn(TabState, 'useState').mockReturnValue({
      activeTabId: null,
    });
    vi.spyOn(EditorState, 'useState').mockReturnValue({});

    render(<Sidebar />);
    const logo = screen.getByText('Z');
    fireEvent.click(logo);
    expect(stateUpdate).toHaveBeenCalled();
  });

  it('filters files by their full relative path', async () => {
    vi.spyOn(SidebarState, 'useState').mockReturnValue({
      isSidebarOpen: true,
      folderTree,
      showAIInput: true,
      expandedFolders: {},
    });
    vi.spyOn(AppState, 'useState').mockReturnValue({
      projectName: 'Test Project',
      fs: { mode: null, mountLocal: vi.fn() },
    });
    vi.spyOn(TabState, 'useState').mockReturnValue({
      activeTabId: null,
    });
    vi.spyOn(EditorState, 'useState').mockReturnValue({});

    render(<Sidebar />);
    fireEvent.change(screen.getByPlaceholderText(/Search files/i), {
      target: { value: 'src/components/icons' },
    });

    await waitFor(() => {
      expect(screen.getByText('Icons.jsx')).toBeDefined();
      expect(screen.queryByText('AnimatedCard.jsx')).toBeNull();
      expect(screen.queryByText('package.json')).toBeNull();
    });
  });

  it('keeps a matching folder visible with its children', async () => {
    vi.spyOn(SidebarState, 'useState').mockReturnValue({
      isSidebarOpen: true,
      folderTree,
      showAIInput: true,
      expandedFolders: {},
    });
    vi.spyOn(AppState, 'useState').mockReturnValue({
      projectName: 'Test Project',
      fs: { mode: null, mountLocal: vi.fn() },
    });
    vi.spyOn(TabState, 'useState').mockReturnValue({
      activeTabId: null,
    });
    vi.spyOn(EditorState, 'useState').mockReturnValue({});

    render(<Sidebar />);
    fireEvent.change(screen.getByPlaceholderText(/Search files/i), {
      target: { value: 'components' },
    });

    await waitFor(() => {
      expect(screen.getByText('components')).toBeDefined();
      expect(screen.getByText('AnimatedCard.jsx')).toBeDefined();
      expect(screen.getByText('Icons.jsx')).toBeDefined();
    });
  });
});
