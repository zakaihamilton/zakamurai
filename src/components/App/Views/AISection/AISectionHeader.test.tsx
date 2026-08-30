import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AISectionHeader from './AISectionHeader';

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    ArrowDownToLine: () => <span data-testid="icon-auto-scroll" />,
    Brain: () => <span data-testid="icon-brain" />,
    Check: () => <span data-testid="icon-check" />,
    Copy: () => <span data-testid="icon-copy" />,
    Terminal: () => <span data-testid="icon-terminal" />,
  },
}));

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

describe('AISectionHeader', () => {
  const defaultProps = {
    title: 'Progress & Reasoning',
    showStepIOToggle: true,
    showStepIO: false,
    showViewToggle: true,
    viewType: 'visual' as const,
    copied: false,
    onToggleStepIO: vi.fn(),
    onSelectView: vi.fn(),
    onToggleAutoScroll: vi.fn(),
    onCopy: vi.fn(),
  };

  it('selects the visual timeline by default and exposes the text log option', () => {
    render(<AISectionHeader {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Show visual timeline' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Show text log' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('notifies the parent when the text log is selected', () => {
    const onSelectView = vi.fn();
    render(<AISectionHeader {...defaultProps} onSelectView={onSelectView} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show text log' }));
    expect(onSelectView).toHaveBeenCalledWith('text');
  });

  it('does not render the view switch for non-reasoning sections', () => {
    render(<AISectionHeader {...defaultProps} showViewToggle={false} showStepIOToggle={false} />);
    expect(screen.queryByRole('button', { name: 'Show visual timeline' })).toBeNull();
  });
});
