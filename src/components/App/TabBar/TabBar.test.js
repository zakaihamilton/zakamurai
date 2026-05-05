import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ZakamuraiState } from '../State';
import TabBar from './TabBar';

vi.mock('../State', () => ({
  ZakamuraiState: {
    useState: vi.fn(),
  },
}));

describe('TabBar', () => {
  it('renders open tabs', () => {
    ZakamuraiState.useState.mockReturnValue({
      openTabs: [
        { id: 'tab1', label: 'Tab 1', type: 'file' },
        { id: 'tab2', label: 'Tab 2', type: 'file' },
      ],
      activeTabId: 'tab1',
    });

    render(<TabBar />);
    expect(screen.getByText('Tab 1')).toBeDefined();
    expect(screen.getByText('Tab 2')).toBeDefined();
  });

  it('calls state update when a tab is clicked', () => {
    const stateUpdate = vi.fn();
    ZakamuraiState.useState.mockReturnValue(
      Object.assign(stateUpdate, {
        openTabs: [{ id: 'tab1', label: 'Tab 1', type: 'file' }],
        activeTabId: 'tab1',
      }),
    );

    render(<TabBar />);
    fireEvent.click(screen.getByText('Tab 1'));
    expect(stateUpdate).toHaveBeenCalled();
  });
});
