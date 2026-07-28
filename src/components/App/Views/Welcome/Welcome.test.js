import { TabState } from '@/components/App/Panes';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Welcome from './Welcome';

vi.mock('@/components/App/Panes', () => ({ TabState: { usePassiveState: vi.fn() } }));
vi.mock('./Prompt', () => ({ default: () => <div data-testid="welcome-prompt" /> }));
vi.mock('@/components/ui/Tooltip', () => ({
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
  it('renders welcome actions', () => {
    vi.spyOn(TabState, 'usePassiveState').mockReturnValue({
      openTabs: [],
      activeTabId: null,
    });

    render(<Welcome />);
    expect(screen.getByText('Project info')).toBeDefined();
    expect(screen.getByText('Instructions')).toBeDefined();
  });

  it('opens project info tab', () => {
    const tabState = { openTabs: [], activeTabId: null };
    vi.spyOn(TabState, 'usePassiveState').mockReturnValue(tabState);

    render(<Welcome />);
    fireEvent.click(screen.getByText('Project info'));
    expect(tabState.activeTabId).toBe('project-info');
    expect(tabState.openTabs.some((t) => t.id === 'project-info')).toBe(true);
  });

  it('opens instructions tab when clicked', () => {
    const tabState = { openTabs: [], activeTabId: null };
    vi.spyOn(TabState, 'usePassiveState').mockReturnValue(tabState);

    render(<Welcome />);
    fireEvent.click(screen.getByText('Instructions'));
    expect(tabState.activeTabId).toBe('instructions');
    expect(tabState.openTabs.some((t) => t.id === 'instructions')).toBe(true);
  });

  it('does not duplicate instructions tab if already open', () => {
    const tabState = {
      openTabs: [{ id: 'instructions', type: 'instructions', label: 'Instructions' }],
      activeTabId: null,
    };
    vi.spyOn(TabState, 'usePassiveState').mockReturnValue(tabState);

    render(<Welcome />);
    fireEvent.click(screen.getByText('Instructions'));
    expect(tabState.activeTabId).toBe('instructions');
    expect(tabState.openTabs.filter((t) => t.id === 'instructions')).toHaveLength(1);
  });
});
