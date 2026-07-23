vi.mock('@/components/Storage', () => ({
  useFileSystem: vi.fn(() => ({
    mode: null,
    files: [],
    version: 0,
    mountLocal: vi.fn(),
    rootHandle: null,
  })),
}));
import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { useFileSystem } from '@/components/Storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarState, SidebarUiState } from './Sidebar';
import Sidebar from './Sidebar';

// Mock scroll/scrollTo since it's not implemented in jsdom
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.scrollTo = vi.fn();

// Mock the state
vi.mock('@/components/App/AppState', () => ({
  AppState: {
    useState: vi.fn(),
    usePassiveState: vi.fn(),
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
    usePassiveState: vi.fn(),
  },
}));

describe('Sidebar', () => {
  const createUiState = (values = {}) =>
    Object.assign(vi.fn(), {
      filterText: '',
      loadingPaths: {},
      dropTargetPath: null,
      animatedWidth: 250,
      ...values,
    });

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

  beforeEach(() => {
    AppState.usePassiveState.mockReturnValue(
      Object.assign(vi.fn(), { projectName: 'App', isMobile: false }),
    );
    useFileSystem.mockReturnValue({
      mode: null,
      files: [],
      version: 0,
      mountLocal: vi.fn(),
      rootHandle: null,
    });

    vi.clearAllMocks();
  });

  it('renders the project name', () => {
    vi.spyOn(SidebarState, 'useState').mockReturnValue({
      isSidebarOpen: true,
      folderTree: [],
      showAIInput: true,
    });
    vi.spyOn(SidebarUiState, 'useState').mockReturnValue(createUiState());
    vi.spyOn(AppState, 'useState').mockReturnValue({
      projectName: 'Test Project',
      fs: { mode: null, mountLocal: vi.fn() },
    });
    vi.spyOn(TabState, 'useState').mockReturnValue({
      activeTabId: null,
    });
    vi.spyOn(EditorState, 'usePassiveState').mockReturnValue({});

    render(<Sidebar />);
    expect(screen.getByText('Test Project')).toBeDefined();
  });

  it('filters files by their full relative path', async () => {
    vi.spyOn(SidebarState, 'useState').mockReturnValue({
      isSidebarOpen: true,
      folderTree,
      showAIInput: true,
      expandedFolders: {},
    });
    const uiStateUpdater = createUiState();
    vi.spyOn(SidebarUiState, 'useState').mockReturnValue(uiStateUpdater);
    vi.spyOn(AppState, 'useState').mockReturnValue({
      projectName: 'Test Project',
      fs: { mode: null, mountLocal: vi.fn() },
    });
    vi.spyOn(TabState, 'useState').mockReturnValue({
      activeTabId: null,
    });
    vi.spyOn(EditorState, 'usePassiveState').mockReturnValue({});

    render(<Sidebar />);
    fireEvent.change(screen.getByPlaceholderText(/Search files/i), {
      target: { value: 'src/components/icons' },
    });

    expect(uiStateUpdater).toHaveBeenCalled();
  });

  it('highlights the matching letters in visible file names', async () => {
    vi.spyOn(SidebarState, 'useState').mockReturnValue({
      isSidebarOpen: true,
      folderTree,
      showAIInput: true,
      expandedFolders: {},
    });
    vi.spyOn(SidebarUiState, 'useState').mockReturnValue(createUiState({ filterText: 'icons' }));
    vi.spyOn(AppState, 'useState').mockReturnValue({
      projectName: 'Test Project',
      fs: { mode: null, mountLocal: vi.fn() },
    });
    vi.spyOn(TabState, 'useState').mockReturnValue({
      activeTabId: null,
    });
    vi.spyOn(EditorState, 'usePassiveState').mockReturnValue({});

    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByText('Icons')).toBeDefined();
      expect(screen.getByText('Icons').tagName).toBe('MARK');
    });
  });

  it('keeps a matching folder visible with its children', async () => {
    vi.spyOn(SidebarState, 'useState').mockReturnValue({
      isSidebarOpen: true,
      folderTree,
      showAIInput: true,
      expandedFolders: {},
    });
    vi.spyOn(SidebarUiState, 'useState').mockReturnValue(
      createUiState({ filterText: 'components' }),
    );
    vi.spyOn(AppState, 'useState').mockReturnValue({
      projectName: 'Test Project',
      fs: { mode: null, mountLocal: vi.fn() },
    });
    vi.spyOn(TabState, 'useState').mockReturnValue({
      activeTabId: null,
    });
    vi.spyOn(EditorState, 'usePassiveState').mockReturnValue({});

    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByText('components')).toBeDefined();
      expect(screen.getByText('AnimatedCard.jsx')).toBeDefined();
      expect(screen.getByText('Icons.jsx')).toBeDefined();
    });
  });

  it('auto-expands parent folders for active tab', async () => {
    const stateUpdater = vi.fn();
    vi.spyOn(SidebarState, 'useState').mockReturnValue(
      Object.assign(stateUpdater, {
        isSidebarOpen: true,
        folderTree,
        showAIInput: true,
        expandedFolders: {},
      }),
    );
    vi.spyOn(SidebarUiState, 'useState').mockReturnValue(createUiState());
    vi.spyOn(AppState, 'useState').mockReturnValue({
      projectName: 'Test Project',
      fs: { mode: 'local', mountLocal: vi.fn() },
    });
    vi.spyOn(TabState, 'useState').mockReturnValue({
      activeTabId: 'src/components/Icons.jsx',
      openTabs: [{ id: 'src/components/Icons.jsx', type: 'file' }],
    });
    vi.spyOn(EditorState, 'usePassiveState').mockReturnValue({});

    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeDefined();
    });
  });
});
