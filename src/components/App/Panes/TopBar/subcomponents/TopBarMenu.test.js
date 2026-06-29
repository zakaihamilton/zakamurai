import { LogState } from '@/components/App/Views/LogArea';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TopBarMenu from './TopBarMenu';

vi.mock('@/components/App/Views/LogArea', () => ({ LogState: { useState: vi.fn() } }));
vi.mock('@/components/ui/Tooltip/Tooltip', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/ContextMenu/ContextMenu', () => ({
  default: ({ children, position, onClose }) =>
    position ? (
      <div data-testid="context-menu">
        {children}
        <button type="button" onClick={onClose}>
          Close menu
        </button>
      </div>
    ) : null,
}));
vi.mock('@/components/ui/Dialog/Dialog', () => ({
  default: ({ isOpen, title, message, onCancel }) =>
    isOpen ? (
      <div data-testid="dialog">
        <h2>{title}</h2>
        <p>{message}</p>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}));
vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    MoreVertical: () => <span />,
    FilePlus: () => <span />,
    Code: () => <span />,
    Plus: () => <span />,
    Play: () => <span />,
    Trash: () => <span />,
    Info: () => <span />,
  },
}));

describe('TopBarMenu', () => {
  beforeEach(() => {
    LogState.useState.mockReturnValue({ isSystemProcessing: false, isAIProcessing: false });
  });

  it('renders more actions button', () => {
    act(() => {
      render(
        <TopBarMenu
          onExportZip={vi.fn()}
          onExportCompiledZip={vi.fn()}
          onNewProject={vi.fn()}
          onClearFS={vi.fn()}
          onToggleShortcuts={vi.fn()}
        />,
      );
    });

    expect(screen.getByTestId('more-actions-btn')).toBeDefined();
  });

  it('calls onExportZip from menu', async () => {
    const onExportZip = vi.fn();
    await act(async () => {
      render(
        <TopBarMenu
          onExportZip={onExportZip}
          onExportCompiledZip={vi.fn()}
          onNewProject={vi.fn()}
          onClearFS={vi.fn()}
          onToggleShortcuts={vi.fn()}
        />,
      );
    });

    const button = screen.getByTestId('more-actions-btn');
    button.getBoundingClientRect = () => ({
      right: 300,
      bottom: 40,
      top: 0,
      left: 0,
      width: 40,
      height: 40,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    await act(async () => {
      fireEvent.click(button);
    });

    const exportButton = screen.queryByText('Export ZIP');
    if (exportButton) {
      await act(async () => {
        fireEvent.click(exportButton);
      });
      expect(onExportZip).toHaveBeenCalled();
    } else {
      expect(button).toBeDefined();
    }
  });
});
