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

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search AI models' }), {
      target: { value: 'qwen' },
    });

    expect(onSearchTermChange).toHaveBeenCalledWith('qwen');
  });

  it('shows and uses the clear button when a term is present', () => {
    const onSearchTermChange = vi.fn();
    render(<ModelSearch searchTerm="cached" onSearchTermChange={onSearchTermChange} />);

    expect(screen.getByRole('button', { name: 'Clear model search' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Clear model search' }));
    expect(onSearchTermChange).toHaveBeenCalledWith('');
  });

  it('hides the clear button when the search term is empty', () => {
    render(<ModelSearch searchTerm="" onSearchTermChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Clear model search' })).toBeNull();
  });
});
