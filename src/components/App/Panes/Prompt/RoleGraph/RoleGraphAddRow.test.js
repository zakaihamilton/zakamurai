import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RoleGraphAddRow from './RoleGraphAddRow';

describe('RoleGraphAddRow', () => {
  const kindOptions = [
    { value: 'custom', label: 'Custom' },
    { value: 'reviewer', label: 'Reviewer' },
  ];

  it('renders add chips and calls onAdd with the selected kind', () => {
    const onAdd = vi.fn();
    render(<RoleGraphAddRow kindOptions={kindOptions} onAdd={onAdd} />);

    fireEvent.click(screen.getByRole('button', { name: '+ Custom' }));
    expect(onAdd).toHaveBeenCalledWith('custom');
  });

  it('disables add chips when disabled', () => {
    render(<RoleGraphAddRow kindOptions={kindOptions} disabled onAdd={vi.fn()} />);
    expect(screen.getByRole('button', { name: '+ Custom' })).toBeDisabled();
  });
});
