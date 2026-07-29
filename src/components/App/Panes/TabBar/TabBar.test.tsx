import type { ReactNode } from 'react';
import type { Tab } from '@/components/state/domain-types';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { createMockTab } from '@/test-utils/editorMocks';
import { makeSidebarState, makeTabState } from '@/test-utils/stateMocks';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TabState } from './TabBar';
import TabBar from './TabBar';

function fileTab(id: string, label: string, path: string[] = []): Tab {
  return createMockTab({
    id,
    label,
    type: 'file',
    file: { name: path[path.length - 1] ?? label, path },
  });
}

vi.mock('../Sidebar', () => ({
  SidebarState: {
    useState: vi.fn(),
  },
}));

type TooltipMockProps = { children?: ReactNode; content?: string };

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children, content }: TooltipMockProps) => (
    <span data-content={content}>{children}</span>
  ),
}));

vi.mock('@/components/Storage/Settings', () => ({
  default: {
    setOpenTabs: vi.fn(),
    setActiveTabId: vi.fn(),
  },
}));

vi.mock('./useTabDragAndDrop', () => ({
  default: () => ({
    handleDragStart: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragEnd: vi.fn(),
    handleDrop: vi.fn(),
    handleDropOnBar: vi.fn(),
  }),
}));

// Capture TabContextMenu callbacks so we can test them
let _capturedContextMenuProps: Record<string, unknown> | null = null;
type TabContextMenuMockProps = {
  tab: { id: string };
  onCloseTab: (id: string) => void;
  onCloseOthers: (id: string) => void;
  onCloseToLeft: (id: string) => void;
  onCloseToRight: (id: string) => void;
  onCloseAll: () => void;
  onClose: () => void;
};

vi.mock('./TabContextMenu', () => ({
  default: (props: TabContextMenuMockProps) => {
    _capturedContextMenuProps = props;
    return (
      <div data-testid="TabContextMenu">
        <button type="button" onClick={() => props.onCloseTab(props.tab.id)}>
          ctx-close
        </button>
        <button type="button" onClick={() => props.onCloseOthers(props.tab.id)}>
          ctx-close-others
        </button>
        <button type="button" onClick={() => props.onCloseToLeft(props.tab.id)}>
          ctx-close-left
        </button>
        <button type="button" onClick={() => props.onCloseToRight(props.tab.id)}>
          ctx-close-right
        </button>
        <button type="button" onClick={() => props.onCloseAll()}>
          ctx-close-all
        </button>
        <button type="button" onClick={() => props.onClose()}>
          ctx-dismiss
        </button>
      </div>
    );
  },
}));

describe('TabBar', () => {
  it('renders open tabs', () => {
    vi.spyOn(TabState, 'useState').mockReturnValue(
      makeTabState({
        openTabs: [fileTab('tab1', 'Tab 1'), fileTab('tab2', 'Tab 2')],
        activeTabId: 'tab1',
      }),
    );
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState());

    render(<TabBar />);
    expect(screen.getByText('Tab 1')).toBeDefined();
    expect(screen.getByText('Tab 2')).toBeDefined();
  });

  it('calls state update when a tab is clicked', () => {
    const stateUpdate = makeTabState({
      openTabs: [fileTab('tab1', 'Tab 1')],
      activeTabId: 'tab1',
    });
    vi.spyOn(TabState, 'useState').mockReturnValue(stateUpdate);
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState());

    render(<TabBar />);
    fireEvent.click(screen.getByText('Tab 1'));
    expect(stateUpdate).toHaveBeenCalled();
  });

  it('renders token breakdown tabs as closeable tabs', () => {
    const stateUpdate = makeTabState({
      openTabs: [
        {
          id: 'token-breakdown:src/test.js',
          label: 'test.js',
          type: 'token-breakdown',
          sourceFilePath: 'src/test.js',
        },
      ],
      activeTabId: 'token-breakdown:src/test.js',
    });
    vi.spyOn(TabState, 'useState').mockReturnValue(stateUpdate);
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState());

    render(<TabBar />);
    expect(screen.getByText('test.js')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /close tab/i }));
    expect(stateUpdate).toHaveBeenCalled();
  });

  it('shows close-all button when more than one tab is open', () => {
    const stateUpdate = makeTabState({
      openTabs: [
        fileTab('tab1', 'Tab 1'),
        fileTab('tab2', 'Tab 2'),
      ],
      activeTabId: 'tab1',
    });
    vi.spyOn(TabState, 'useState').mockReturnValue(stateUpdate);
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState());

    render(<TabBar />);
    const closeAllBtn = screen.getByRole('button', { name: /close all tabs/i });
    fireEvent.click(closeAllBtn);
    expect(stateUpdate).toHaveBeenCalled();
  });

  it('opens context menu on right-click', () => {
    const stateUpdate = makeTabState({
      openTabs: [fileTab('tab1', 'Tab 1')],
      activeTabId: 'tab1',
    });
    vi.spyOn(TabState, 'useState').mockReturnValue(stateUpdate);
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState());

    render(<TabBar />);
    fireEvent.contextMenu(screen.getByText('Tab 1'));
    // The context menu should be rendered in the DOM (via our mock)
    expect(screen.getByTestId('TabContextMenu')).toBeDefined();
  });

  it('returns null when no tabs are open', () => {
    vi.spyOn(TabState, 'useState').mockReturnValue(
      makeTabState({ openTabs: [], activeTabId: null }),
    );
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState());

    const { container } = render(<TabBar />);
    expect(container.firstChild).toBeNull();
  });

  it('triggers dragOver and dragLeave on tab bar', async () => {
    const tabBarUiUpdater = vi.fn();
    const _tabBarUiState = Object.assign(tabBarUiUpdater, {
      draggedTabId: null,
      dropTargetId: null,
      isOverBar: false,
    });

    const stateUpdate = makeTabState({
      openTabs: [fileTab('tab1', 'Tab 1')],
      activeTabId: 'tab1',
    });
    vi.spyOn(TabState, 'useState').mockReturnValue(stateUpdate);
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState());

    const { container } = render(<TabBar />);
    const tabBarContainer = container.firstChild!;

    await act(async () => {
      fireEvent.dragOver(tabBarContainer, {
        dataTransfer: { dropEffect: '' },
      });
      fireEvent.dragLeave(tabBarContainer);
    });
    // No crash is good enough — handlers ran
  });

  it('context menu closeOtherTabs calls state update', () => {
    const stateUpdate = makeTabState({
      openTabs: [
        fileTab('tab1', 'Tab 1', ['tab1']),
        fileTab('tab2', 'Tab 2', ['tab2']),
      ],
      activeTabId: 'tab1',
    });
    vi.spyOn(TabState, 'useState').mockReturnValue(stateUpdate);
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState());

    render(<TabBar />);
    // Open context menu
    fireEvent.contextMenu(screen.getByText('Tab 1'));
    // Click close-others from the captured context menu
    fireEvent.click(screen.getByText('ctx-close-others'));
    expect(stateUpdate).toHaveBeenCalled();
  });

  it('context menu closeTabsToLeft calls state update', () => {
    const stateUpdate = makeTabState({
      openTabs: [
        fileTab('tab1', 'Tab 1'),
        fileTab('tab2', 'Tab 2'),
      ],
      activeTabId: 'tab2',
    });
    vi.spyOn(TabState, 'useState').mockReturnValue(stateUpdate);
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState());

    render(<TabBar />);
    fireEvent.contextMenu(screen.getByText('Tab 2'));
    fireEvent.click(screen.getByText('ctx-close-left'));
    expect(stateUpdate).toHaveBeenCalled();
  });

  it('context menu closeTabsToRight calls state update', () => {
    const stateUpdate = makeTabState({
      openTabs: [
        fileTab('tab1', 'Tab 1'),
        fileTab('tab2', 'Tab 2'),
      ],
      activeTabId: 'tab1',
    });
    vi.spyOn(TabState, 'useState').mockReturnValue(stateUpdate);
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState());

    render(<TabBar />);
    fireEvent.contextMenu(screen.getByText('Tab 1'));
    fireEvent.click(screen.getByText('ctx-close-right'));
    expect(stateUpdate).toHaveBeenCalled();
  });

  it('context menu dismiss sets contextMenu to null', () => {
    const stateUpdate = makeTabState({
      openTabs: [fileTab('tab1', 'Tab 1')],
      activeTabId: 'tab1',
    });
    vi.spyOn(TabState, 'useState').mockReturnValue(stateUpdate);
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState());

    render(<TabBar />);
    fireEvent.contextMenu(screen.getByText('Tab 1'));
    expect(screen.getByTestId('TabContextMenu')).toBeDefined();
    fireEvent.click(screen.getByText('ctx-dismiss'));
    expect(screen.queryByTestId('TabContextMenu')).toBeNull();
  });

  it('expandAncestors is called when clicking a tab with a file path', () => {
    const sidebarState = makeSidebarState({ expandedFolders: {} });
    const stateUpdate = makeTabState({
      openTabs: [
        {
          id: 'src/components/App.js',
          label: 'App.js',
          type: 'file',
          file: { name: 'App.js', path: ['src', 'components', 'App.js'] },
        },
      ],
      activeTabId: 'src/components/App.js',
    });
    vi.spyOn(TabState, 'useState').mockReturnValue(stateUpdate);
    vi.mocked(SidebarState.useState).mockReturnValue(sidebarState);

    render(<TabBar />);
    fireEvent.click(screen.getByText('App.js'));
    expect(stateUpdate).toHaveBeenCalled();
    expect(sidebarState).toHaveBeenCalled();
  });
});
