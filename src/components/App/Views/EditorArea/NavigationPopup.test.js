import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NavigationPopup from './NavigationPopup';

vi.mock('@/components/ui/Tooltip/Tooltip', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

const basePopup = {
  visible: true,
  x: 10,
  y: 20,
  targets: [
    {
      filePath: 'src/foo.js',
      fileName: 'foo.js',
      loc: { line: 5, col: 1, index: 0 },
    },
  ],
};

describe('NavigationPopup', () => {
  it('returns null when not visible', () => {
    const { container } = render(
      <NavigationPopup
        popup={{ ...basePopup, visible: false }}
        onClose={vi.fn()}
        onJumpToTarget={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows import header text', () => {
    render(
      <NavigationPopup
        popup={{ ...basePopup, isImport: true }}
        onClose={vi.fn()}
        onJumpToTarget={vi.fn()}
      />,
    );
    expect(screen.getByText('Open Import')).toBeDefined();
  });

  it('shows export header text', () => {
    render(
      <NavigationPopup
        popup={{ ...basePopup, isExport: true }}
        onClose={vi.fn()}
        onJumpToTarget={vi.fn()}
      />,
    );
    expect(screen.getByText('Referenced in')).toBeDefined();
  });

  it('calls onJumpToTarget and onClose when target clicked', () => {
    const onJumpToTarget = vi.fn();
    const onClose = vi.fn();
    render(<NavigationPopup popup={basePopup} onClose={onClose} onJumpToTarget={onJumpToTarget} />);

    fireEvent.click(screen.getByText('foo.js'));
    expect(onJumpToTarget).toHaveBeenCalledWith('src/foo.js', basePopup.targets[0].loc);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when close button clicked', () => {
    const onClose = vi.fn();
    render(<NavigationPopup popup={basePopup} onClose={onClose} onJumpToTarget={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close popup' }));
    expect(onClose).toHaveBeenCalled();
  });
});
