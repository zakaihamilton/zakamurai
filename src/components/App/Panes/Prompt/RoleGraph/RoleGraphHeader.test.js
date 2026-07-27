import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RoleGraphHeader from './RoleGraphHeader';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Refresh: () => <span>refresh</span>,
    Plus: () => <span>plus</span>,
  },
}));

describe('RoleGraphHeader', () => {
  it('shows the title by default', () => {
    render(<RoleGraphHeader onReset={vi.fn()} onAddCustom={vi.fn()} />);
    expect(screen.getByText('Role graph')).toBeDefined();
    expect(screen.getByText(/Order, kinds, and per-role models/)).toBeDefined();
  });

  it('hides the title when showTitle is false', () => {
    render(<RoleGraphHeader showTitle={false} onReset={vi.fn()} onAddCustom={vi.fn()} />);
    expect(screen.queryByText('Role graph')).toBeNull();
    expect(screen.getByText(/Order, kinds, and per-role models/)).toBeDefined();
  });

  it('fires reset and add callbacks from header actions', () => {
    const onReset = vi.fn();
    const onAddCustom = vi.fn();

    render(<RoleGraphHeader onReset={onReset} onAddCustom={onAddCustom} />);

    fireEvent.click(screen.getByLabelText('Reset role graph'));
    fireEvent.click(screen.getByLabelText('Add role'));
    expect(onReset).toHaveBeenCalled();
    expect(onAddCustom).toHaveBeenCalled();
  });
});
