import { TabState } from '@/components/App/Panes';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Welcome from './Welcome';

vi.mock('@/components/App/Panes', () => ({ TabState: { useState: vi.fn() } }));
vi.mock('@/components/ui/Tooltip/Tooltip', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    ZLogo: () => <span />,
    Info: () => <span />,
    Code: () => <span />,
    Github: () => <span />,
    Linkedin: () => <span />,
  },
}));

describe('Welcome', () => {
  it('renders welcome content', () => {
    vi.spyOn(TabState, 'useState').mockReturnValue({
      openTabs: [],
      activeTabId: null,
    });

    render(<Welcome />);
    expect(screen.getByText('Welcome to Zakamurai')).toBeDefined();
    expect(screen.getByText('Project info')).toBeDefined();
    expect(screen.getByText('Instructions')).toBeDefined();
  });

  it('opens project info tab', () => {
    const tabState = { openTabs: [], activeTabId: null };
    vi.spyOn(TabState, 'useState').mockReturnValue(tabState);

    render(<Welcome />);
    fireEvent.click(screen.getByText('Project info'));
    expect(tabState.activeTabId).toBe('project-info');
    expect(tabState.openTabs.some((t) => t.id === 'project-info')).toBe(true);
  });
});
