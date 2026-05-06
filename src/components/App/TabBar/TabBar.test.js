import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarState } from '../Sidebar';
import { TabState } from './TabBar';
import TabBar from './TabBar';

// No need to mock TabBar itself
vi.mock('../Sidebar', () => ({
  SidebarState: {
    useState: vi.fn(),
  },
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
});
