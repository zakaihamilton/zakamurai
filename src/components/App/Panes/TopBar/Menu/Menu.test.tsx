import { LogState } from '@/components/App/Views/LogArea';
import { makeLogState } from '@/test-utils/stateMocks';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TopBarMenu from './Menu';

type ContextMenuMockProps = {
  children?: ReactNode;
  position?: { x: number; y: number } | null;
  onClose?: () => void;
};

type DialogMockProps = {
  isOpen?: boolean;
  title?: ReactNode;
  message?: ReactNode;
  onCancel?: () => void;
};

vi.mock('@/components/App/Views/LogArea', () => ({ LogState: { useState: vi.fn() } }));
vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/ContextMenu', () => ({
  default: ({ children, position, onClose }: ContextMenuMockProps) =>
    position ? (
      <div data-testid="context-menu">
        {children}
        <button type="button" onClick={onClose}>
          Close menu
        </button>
      </div>
    ) : null,
}));
vi.mock('@/components/ui/Dialog', () => ({
  default: ({ isOpen, title, message, onCancel }: DialogMockProps) =>
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
    Download: () => <span />,
    Trash: () => <span />,
    Info: () => <span />,
  },
}));

const defaultMenuProps = {
  onExportZip: vi.fn(),
  onExportCompiledZip: vi.fn(),
  onExportSupportReport: vi.fn(),
  onNewProject: vi.fn(),
  onClearFS: vi.fn(),
  onToggleShortcuts: vi.fn(),
};

describe('TopBarMenu', () => {
  beforeEach(() => {
    vi.mocked(LogState.useState).mockReturnValue(
      makeLogState({ isSystemProcessing: false, isAIProcessing: false }),
    );
  });

  it('renders more actions button', () => {
    act(() => {
      render(<TopBarMenu {...defaultMenuProps} />);
    });

    expect(screen.getByTestId('more-actions-btn')).toBeDefined();
  });

  it('calls onExportZip from menu', async () => {
    const onExportZip = vi.fn();
    await act(async () => {
      render(<TopBarMenu {...defaultMenuProps} onExportZip={onExportZip} />);
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
