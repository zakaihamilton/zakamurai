import { AppState } from '@/components/App/AppState';
import { makeAppState, makeSidebarState } from '@/test-utils/stateMocks';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
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
  default: ({
    onResize,
    onResizeStart,
    onResizeEnd,
    onDoubleClick,
  }: {
    onResize?: (clientX: number) => void;
    onResizeStart?: () => void;
    onResizeEnd?: () => void;
    onDoubleClick?: () => void;
  }) => (
    <div
      data-testid="resizer"
      onMouseDown={onResizeStart}
      onMouseUp={onResizeEnd}
      onDoubleClick={onDoubleClick}
      onMouseMove={(e) => onResize?.(e.clientX)}
    />
  ),
}));
vi.mock('../Popups', () => ({
  ShortcutsHelp: ({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) =>
    isOpen ? (
      <button type="button" data-testid="close-shortcuts" onClick={onClose}>
        Close
      </button>
    ) : null,
  CompletionDebug: ({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) =>
    isOpen ? (
      <button type="button" data-testid="close-completion" onClick={onClose}>
        Close
      </button>
    ) : null,
}));
vi.mock('../../state/Node', () => ({
  default: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

describe('AppContent', () => {
  it('renders main layout regions', () => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState());
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState());

    render(<AppContent />);
    expect(screen.getByTestId('top-bar')).toBeDefined();
    expect(screen.getByTestId('sidebar')).toBeDefined();
    expect(screen.getByTestId('workspace-area')).toBeDefined();
    expect(screen.getByTestId('status-bar')).toBeDefined();
  });

  it('shows shortcuts help when enabled and allows closing', () => {
    const appState = makeAppState({ showShortcuts: true });
    vi.mocked(AppState.useState).mockReturnValue(appState);
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState());

    const { getByTestId } = render(<AppContent />);
    expect(getByTestId('close-shortcuts')).toBeDefined();
    getByTestId('close-shortcuts').click();
    expect(appState).toHaveBeenCalled();
  });

  it('shows completion debug when enabled and allows closing', () => {
    const appState = makeAppState({ showCompletionDebug: true });
    vi.mocked(AppState.useState).mockReturnValue(appState);
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState());

    const { getByTestId } = render(<AppContent />);
    expect(getByTestId('close-completion')).toBeDefined();
    getByTestId('close-completion').click();
    expect(appState).toHaveBeenCalled();
  });

  it('renders Resizer in non-mobile mode', () => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ isMobile: false }));
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState());

    render(<AppContent />);
    expect(screen.getByTestId('resizer')).toBeDefined();
  });

  it('does not render Resizer in mobile mode', () => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ isMobile: true }));
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState());

    render(<AppContent />);
    expect(screen.queryByTestId('resizer')).toBeNull();
  });

  it('renders mobile overlay when mobile and sidebar popup open', () => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ isMobile: true }));
    vi.mocked(SidebarState.useState).mockReturnValue(
      makeSidebarState({ isSidebarPopupOpen: true }),
    );

    render(<AppContent />);
    expect(screen.getByRole('button', { name: /close overlays/i })).toBeDefined();
  });

  it('closes mobile overlays on overlay click', () => {
    const appState = makeAppState({ isMobile: true });
    const sidebarState = makeSidebarState({ isSidebarPopupOpen: true });
    vi.mocked(AppState.useState).mockReturnValue(appState);
    vi.mocked(SidebarState.useState).mockReturnValue(sidebarState);

    const { getByRole } = render(<AppContent />);
    fireEvent.click(getByRole('button', { name: /close overlays/i }));
    expect(sidebarState).toHaveBeenCalled();
  });

  it('closes mobile overlays on overlay Enter key', () => {
    const sidebarState = makeSidebarState({ isAIInputPopupOpen: true });
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ isMobile: true }));
    vi.mocked(SidebarState.useState).mockReturnValue(sidebarState);

    const { getByRole } = render(<AppContent />);
    fireEvent.keyDown(getByRole('button', { name: /close overlays/i }), { key: 'Enter' });
    expect(sidebarState).toHaveBeenCalled();
  });

  it('resizes sidebar when resizer moves', () => {
    const sidebarState = makeSidebarState({ isSidebarOpen: true });
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ isMobile: false }));
    vi.mocked(SidebarState.useState).mockReturnValue(sidebarState);

    const { getByTestId } = render(<AppContent />);
    fireEvent.mouseMove(getByTestId('resizer'), { clientX: 400 });
    expect(sidebarState).toHaveBeenCalled();
  });

  it('applies light theme class', () => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ theme: 'light' }));
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState());

    const { container } = render(<AppContent />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
