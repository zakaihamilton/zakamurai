import { EditorState } from '@/components/App/EditorArea';
import { TabState } from '@/components/App/TabBar';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppState } from '../AppState';
import { SidebarState } from './Sidebar';
import Sidebar from './Sidebar';

// Mock the state
vi.mock('../AppState', () => ({
  AppState: {
    useState: vi.fn(),
  },
}));

vi.mock('../TabBar', () => ({
  TabState: {
    useState: vi.fn(),
  },
}));

vi.mock('../EditorArea', () => ({
  EditorState: {
    useState: vi.fn(),
  },
}));

describe('Sidebar', () => {
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
});
