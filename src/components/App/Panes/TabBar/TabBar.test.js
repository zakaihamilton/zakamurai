import { SidebarState } from '@/components/App/Panes/Sidebar';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TabState } from './TabBar';
import TabBar from './TabBar';

// No need to mock TabBar itself
vi.mock('../Sidebar', () => ({
  SidebarState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/ui/Tooltip/Tooltip', () => ({
  default: ({ children, content }) => <span data-content={content}>{children}</span>,
}));

describe('TabBar', () => {
  it('renders open tabs', () => {
    vi.spyOn(TabState, 'useState').mockReturnValue({
      openTabs: [
        { id: 'tab1', label: 'Tab 1', type: 'file', file: { path: [] } },
        { id: 'tab2', label: 'Tab 2', type: 'file', file: { path: [] } },
      ],
      activeTabId: 'tab1',
    });
    vi.mocked(SidebarState.useState).mockReturnValue(vi.fn());

    render(<TabBar />);
    expect(screen.getByText('Tab 1')).toBeDefined();
    expect(screen.getByText('Tab 2')).toBeDefined();
  });

  it('calls state update when a tab is clicked', () => {
    const stateUpdate = vi.fn();
    vi.spyOn(TabState, 'useState').mockReturnValue(
      Object.assign(stateUpdate, {
        openTabs: [{ id: 'tab1', label: 'Tab 1', type: 'file', file: { path: [] } }],
        activeTabId: 'tab1',
      }),
    );
    vi.mocked(SidebarState.useState).mockReturnValue(vi.fn());

    render(<TabBar />);
    fireEvent.click(screen.getByText('Tab 1'));
    expect(stateUpdate).toHaveBeenCalled();
  });

  it('renders token breakdown tabs as closeable tabs', () => {
    const stateUpdate = vi.fn();
    vi.spyOn(TabState, 'useState').mockReturnValue(
      Object.assign(stateUpdate, {
        openTabs: [
          {
            id: 'token-breakdown:src/test.js',
            label: 'test.js',
            type: 'token-breakdown',
            sourceFilePath: 'src/test.js',
          },
        ],
        activeTabId: 'token-breakdown:src/test.js',
      }),
    );
    vi.mocked(SidebarState.useState).mockReturnValue(vi.fn());

    render(<TabBar />);
    expect(screen.getByText('test.js')).toBeDefined();
    expect(
      screen.getByText('test.js').closest('[data-content]')?.getAttribute('data-content'),
    ).toBe('Token Breakdown\nsrc/test.js');

    fireEvent.click(screen.getByRole('button', { name: /close tab/i }));
    expect(stateUpdate).toHaveBeenCalled();
  });
});
