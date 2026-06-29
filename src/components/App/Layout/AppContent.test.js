import { AppState } from '@/components/App/AppState';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarState } from '../Panes';
import AppContent from './AppContent';

vi.mock('@/components/App/AppState', () => ({ AppState: { useState: vi.fn() } }));
vi.mock('../Panes', () => ({
  SidebarState: { useState: vi.fn() },
  Sidebar: () => <div data-testid="sidebar" />,
  StatusBar: () => <div data-testid="status-bar" />,
  TopBar: () => <div data-testid="top-bar" />,
}));
vi.mock('./WorkspaceArea', () => ({
  default: () => <div data-testid="workspace-area" />,
}));
vi.mock('@/components/ui/Resizer', () => ({
  default: () => <div data-testid="resizer" />,
}));
vi.mock('../Popups', () => ({
  ShortcutsHelp: ({ isOpen }) => (isOpen ? <div data-testid="shortcuts-help" /> : null),
  CompletionDebug: ({ isOpen }) => (isOpen ? <div data-testid="completion-debug" /> : null),
}));

describe('AppContent', () => {
  it('renders main layout regions', () => {
    AppState.useState.mockReturnValue({
      theme: 'dark',
      showShortcuts: false,
      showCompletionDebug: false,
      isResizing: false,
      isMobile: false,
    });
    SidebarState.useState.mockReturnValue({
      isSidebarOpen: true,
      isSidebarPopupOpen: false,
      isAIInputPopupOpen: false,
    });

    render(<AppContent />);
    expect(screen.getByTestId('top-bar')).toBeDefined();
    expect(screen.getByTestId('sidebar')).toBeDefined();
    expect(screen.getByTestId('workspace-area')).toBeDefined();
    expect(screen.getByTestId('status-bar')).toBeDefined();
  });

  it('shows shortcuts help when enabled', () => {
    AppState.useState.mockReturnValue({
      theme: 'dark',
      showShortcuts: true,
      showCompletionDebug: false,
      isResizing: false,
      isMobile: false,
    });
    SidebarState.useState.mockReturnValue({
      isSidebarOpen: true,
      isSidebarPopupOpen: false,
      isAIInputPopupOpen: false,
    });

    render(<AppContent />);
    expect(screen.getByTestId('shortcuts-help')).toBeDefined();
  });
});
