import { AppState } from '@/components/App/AppState';
import { fireEvent, render, screen } from '@testing-library/react';
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
  default: ({ onResize, onResizeStart, onResizeEnd, onDoubleClick }) => (
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
  ShortcutsHelp: ({ isOpen, onClose }) =>
    isOpen ? (
      <button type="button" data-testid="close-shortcuts" onClick={onClose}>
        Close
      </button>
    ) : null,
  CompletionDebug: ({ isOpen, onClose }) =>
    isOpen ? (
      <button type="button" data-testid="close-completion" onClick={onClose}>
        Close
      </button>
    ) : null,
}));
vi.mock('../../state/Node', () => ({
  default: ({ children }) => <>{children}</>,
}));

const makeAppState = (overrides = {}) =>
  Object.assign(vi.fn(), {
    theme: 'dark',
    showShortcuts: false,
    showCompletionDebug: false,
    isResizing: false,
    isMobile: false,
    ...overrides,
  });

const makeSidebarState = (overrides = {}) =>
  Object.assign(vi.fn(), {
    isSidebarOpen: true,
    isSidebarPopupOpen: false,
    isAIInputPopupOpen: false,
    sidebarWidth: 280,
    ...overrides,
  });

describe('AppContent', () => {
  it('renders main layout regions', () => {
    AppState.useState.mockReturnValue(makeAppState());
    SidebarState.useState.mockReturnValue(makeSidebarState());

    render(<AppContent />);
    expect(screen.getByTestId('top-bar')).toBeDefined();
    expect(screen.getByTestId('sidebar')).toBeDefined();
    expect(screen.getByTestId('workspace-area')).toBeDefined();
    expect(screen.getByTestId('status-bar')).toBeDefined();
  });

  it('shows shortcuts help when enabled and allows closing', () => {
    const appState = makeAppState({ showShortcuts: true });
    AppState.useState.mockReturnValue(appState);
    SidebarState.useState.mockReturnValue(makeSidebarState());

    const { getByTestId } = render(<AppContent />);
    expect(getByTestId('close-shortcuts')).toBeDefined();
    getByTestId('close-shortcuts').click();
    expect(appState).toHaveBeenCalled();
  });

  it('shows completion debug when enabled and allows closing', () => {
    const appState = makeAppState({ showCompletionDebug: true });
    AppState.useState.mockReturnValue(appState);
    SidebarState.useState.mockReturnValue(makeSidebarState());

    const { getByTestId } = render(<AppContent />);
    expect(getByTestId('close-completion')).toBeDefined();
    getByTestId('close-completion').click();
    expect(appState).toHaveBeenCalled();
  });

  it('renders Resizer in non-mobile mode', () => {
    AppState.useState.mockReturnValue(makeAppState({ isMobile: false }));
    SidebarState.useState.mockReturnValue(makeSidebarState());

    render(<AppContent />);
    expect(screen.getByTestId('resizer')).toBeDefined();
  });

  it('does not render Resizer in mobile mode', () => {
    AppState.useState.mockReturnValue(makeAppState({ isMobile: true }));
    SidebarState.useState.mockReturnValue(makeSidebarState());

    render(<AppContent />);
    expect(screen.queryByTestId('resizer')).toBeNull();
  });

  it('renders mobile overlay when mobile and sidebar popup open', () => {
    AppState.useState.mockReturnValue(makeAppState({ isMobile: true }));
    SidebarState.useState.mockReturnValue(makeSidebarState({ isSidebarPopupOpen: true }));

    render(<AppContent />);
    expect(screen.getByRole('button', { name: /close overlays/i })).toBeDefined();
  });

  it('does not render mobile overlay when not mobile', () => {
    AppState.useState.mockReturnValue(makeAppState({ isMobile: false }));
    SidebarState.useState.mockReturnValue(makeSidebarState({ isSidebarPopupOpen: true }));

    render(<AppContent />);
    expect(screen.queryByRole('button', { name: /close overlays/i })).toBeNull();
  });

  it('closes mobile overlay on click', () => {
    const sidebarState = makeSidebarState({ isSidebarPopupOpen: true });
    AppState.useState.mockReturnValue(makeAppState({ isMobile: true }));
    SidebarState.useState.mockReturnValue(sidebarState);

    render(<AppContent />);
    fireEvent.click(screen.getByRole('button', { name: /close overlays/i }));
    expect(sidebarState).toHaveBeenCalled();
  });

  it('closes mobile overlay on Enter keydown', () => {
    const sidebarState = makeSidebarState({ isSidebarPopupOpen: true });
    AppState.useState.mockReturnValue(makeAppState({ isMobile: true }));
    SidebarState.useState.mockReturnValue(sidebarState);

    render(<AppContent />);
    fireEvent.keyDown(screen.getByRole('button', { name: /close overlays/i }), { key: 'Enter' });
    expect(sidebarState).toHaveBeenCalled();
  });

  it('ignores non-Enter/Space keydown on overlay', () => {
    const sidebarState = makeSidebarState({ isSidebarPopupOpen: true });
    AppState.useState.mockReturnValue(makeAppState({ isMobile: true }));
    SidebarState.useState.mockReturnValue(sidebarState);

    render(<AppContent />);
    const overlay = screen.getByRole('button', { name: /close overlays/i });
    // Reset call count
    sidebarState.mockClear();
    fireEvent.keyDown(overlay, { key: 'Tab' });
    expect(sidebarState).not.toHaveBeenCalled();
  });

  it('triggers resize handlers on resizer interaction', () => {
    const appState = makeAppState({ isMobile: false });
    const sidebarState = makeSidebarState({ isSidebarOpen: true });
    AppState.useState.mockReturnValue(appState);
    SidebarState.useState.mockReturnValue(sidebarState);

    render(<AppContent />);
    const resizer = screen.getByTestId('resizer');

    fireEvent.mouseDown(resizer);
    expect(appState).toHaveBeenCalled();

    fireEvent.mouseUp(resizer);

    fireEvent.doubleClick(resizer);
    expect(sidebarState).toHaveBeenCalled();
  });

  it('applies light theme class', () => {
    AppState.useState.mockReturnValue(makeAppState({ theme: 'light' }));
    SidebarState.useState.mockReturnValue(makeSidebarState());

    const { container } = render(<AppContent />);
    expect(container.firstChild.className).toContain('light');
  });
});
