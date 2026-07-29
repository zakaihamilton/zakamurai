import type { ReactNode } from 'react';
import { createDefaultRoleGraph } from '@/components/AI/Agent/Roles';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RoleGraphDialog from './RoleGraphDialog';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Plus: () => <span>plus</span>,
    Refresh: () => <span>refresh</span>,
    Trash: () => <span>trash</span>,
    Edit: () => <span>edit</span>,
    Close: () => <span>close</span>,
  },
}));

vi.mock('@/components/ui/Dialog', () => ({
  default: ({ isOpen, title, children, onCancel }) =>
    isOpen ? (
      <dialog open aria-label={title}>
        <h3>{title}</h3>
        <button type="button" onClick={onCancel} aria-label="Close dialog">
          close
        </button>
        {children}
      </dialog>
    ) : null,
}));

describe('RoleGraphDialog', () => {
  it('renders the editor only when open', () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <RoleGraphDialog
        isOpen={false}
        onCancel={onCancel}
        roleGraph={createDefaultRoleGraph()}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Role graph editor')).toBeNull();

    rerender(
      <RoleGraphDialog
        isOpen
        onCancel={onCancel}
        roleGraph={createDefaultRoleGraph()}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Team role graph' })).toBeDefined();
    expect(screen.getByLabelText('Role graph editor')).toBeDefined();

    fireEvent.click(screen.getByLabelText('Close dialog'));
    expect(onCancel).toHaveBeenCalled();
  });
});
