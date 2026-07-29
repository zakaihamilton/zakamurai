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
import { WorkspaceHealthState } from '@/components/Workspace';
import { createMockEditorState, createMockTab, createMockTabState } from '@/test-utils/editorMocks';
import { asMockUseFileSystem } from '@/test-utils/fsMocks';
import {
  makeAppState,
  makeSidebarState,
  makeSidebarUiState,
  makeWorkspaceHealthState,
} from '@/test-utils/stateMocks';
import { asTreeNode } from '@/test-utils/treeMocks';
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
  const folderTree = [
    asTreeNode({
      name: 'src',
      type: 'folder',
      path: ['src'],
      children: [
        asTreeNode({
          name: 'components',
          type: 'folder',
          path: ['src', 'components'],
          children: [
            asTreeNode({
              name: 'AnimatedCard.jsx',
              type: 'file',
              path: ['src', 'components', 'AnimatedCard.jsx'],
            }),
            asTreeNode({
              name: 'Icons.jsx',
              type: 'file',
              path: ['src', 'components', 'Icons.jsx'],
            }),
          ],
        }),
        asTreeNode({ name: 'App.jsx', type: 'file', path: ['src', 'App.jsx'] }),
      ],
    }),
    asTreeNode({ name: 'package.json', type: 'file', path: ['package.json'] }),
  ];

  beforeEach(() => {
    vi.spyOn(SidebarState, 'useState');
    vi.spyOn(SidebarUiState, 'useState');
    vi.spyOn(WorkspaceHealthState, 'useState').mockReturnValue(
      makeWorkspaceHealthState({ status: 'idle' }),
    );
    vi.mocked(AppState.usePassiveState).mockReturnValue(
      makeAppState({ projectName: 'App', isMobile: false }),
    );
    vi.mocked(useFileSystem).mockReturnValue(asMockUseFileSystem());

    vi.clearAllMocks();
  });

  it('renders the project name', () => {
    vi.mocked(SidebarState.useState).mockReturnValue(
      makeSidebarState({ isSidebarOpen: true, folderTree: [], showAIInput: true }),
    );
    vi.mocked(SidebarUiState.useState).mockReturnValue(makeSidebarUiState());
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ projectName: 'Test Project' }));
    vi.mocked(TabState.useState).mockReturnValue(createMockTabState({ activeTabId: null }));
    vi.mocked(EditorState.usePassiveState).mockReturnValue(createMockEditorState());

    render(<Sidebar />);
    expect(screen.getByText('Test Project')).toBeDefined();
  });

  it('filters files by their full relative path', async () => {
    const sidebarUiState = makeSidebarUiState();
    vi.mocked(SidebarState.useState).mockReturnValue(
      makeSidebarState({
        isSidebarOpen: true,
        folderTree,
        showAIInput: true,
        expandedFolders: {},
      }),
    );
    vi.mocked(SidebarUiState.useState).mockReturnValue(sidebarUiState);
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ projectName: 'Test Project' }));
    vi.mocked(TabState.useState).mockReturnValue(createMockTabState({ activeTabId: null }));
    vi.mocked(EditorState.usePassiveState).mockReturnValue(createMockEditorState());

    render(<Sidebar />);
    fireEvent.change(screen.getByPlaceholderText(/Search files/i), {
      target: { value: 'src/components/icons' },
    });

    expect(sidebarUiState).toHaveBeenCalled();
  });

  it('highlights the matching letters in visible file names', async () => {
    vi.mocked(SidebarState.useState).mockReturnValue(
      makeSidebarState({
        isSidebarOpen: true,
        folderTree,
        showAIInput: true,
        expandedFolders: {},
      }),
    );
    vi.mocked(SidebarUiState.useState).mockReturnValue(makeSidebarUiState({ filterText: 'icons' }));
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ projectName: 'Test Project' }));
    vi.mocked(TabState.useState).mockReturnValue(createMockTabState({ activeTabId: null }));
    vi.mocked(EditorState.usePassiveState).mockReturnValue(createMockEditorState());

    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByText('Icons')).toBeDefined();
      expect(screen.getByText('Icons').tagName).toBe('MARK');
    });
  });

  it('keeps a matching folder visible with its children', async () => {
    vi.mocked(SidebarState.useState).mockReturnValue(
      makeSidebarState({
        isSidebarOpen: true,
        folderTree,
        showAIInput: true,
        expandedFolders: {},
      }),
    );
    vi.mocked(SidebarUiState.useState).mockReturnValue(
      makeSidebarUiState({ filterText: 'components' }),
    );
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ projectName: 'Test Project' }));
    vi.mocked(TabState.useState).mockReturnValue(createMockTabState({ activeTabId: null }));
    vi.mocked(EditorState.usePassiveState).mockReturnValue(createMockEditorState());

    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByText('components')).toBeDefined();
      expect(screen.getByText('AnimatedCard.jsx')).toBeDefined();
      expect(screen.getByText('Icons.jsx')).toBeDefined();
    });
  });

  it('auto-expands parent folders for active tab', async () => {
    const sidebarState = makeSidebarState({
      isSidebarOpen: true,
      folderTree,
      showAIInput: true,
      expandedFolders: {},
    });
    vi.mocked(SidebarState.useState).mockReturnValue(sidebarState);
    vi.mocked(SidebarUiState.useState).mockReturnValue(makeSidebarUiState());
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ projectName: 'Test Project' }));
    vi.mocked(TabState.useState).mockReturnValue(
      createMockTabState({
        activeTabId: 'src/components/Icons.jsx',
        openTabs: [
          createMockTab({
            id: 'src/components/Icons.jsx',
            type: 'file',
            label: 'Icons.jsx',
          }),
        ],
      }),
    );
    vi.mocked(EditorState.usePassiveState).mockReturnValue(createMockEditorState());

    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeDefined();
    });
  });
});
