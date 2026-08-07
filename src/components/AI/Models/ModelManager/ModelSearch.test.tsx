import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModelSearch from './ModelSearch';

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Search: () => <span />,
    Close: () => <span />,
  },
}));

describe('ModelSearch', () => {
  it('updates the search term on input', () => {
    const onSearchTermChange = vi.fn();
    render(<ModelSearch searchTerm="" onSearchTermChange={onSearchTermChange} />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search models' }), {
      target: { value: 'qwen' },
    });

    expect(onSearchTermChange).toHaveBeenCalledWith('qwen');
  });

  it('hides the clear button when the search term is empty', () => {
    render(<ModelSearch searchTerm="" onSearchTermChange={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
