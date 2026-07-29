import { makeHighlightDebugToken, makeHighlightTokenRange } from '@/test-utils/tokenMocks';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TokenTableSection from './TokenTableSection';

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Search: () => <span />,
    Close: () => <span />,
  },
}));

const tokens = [
  makeHighlightDebugToken({
    index: 0,
    type: 'hlKw',
    value: 'export',
    range: makeHighlightTokenRange({ startPosition: { line: 1, column: 1 } }),
  }),
  makeHighlightDebugToken({
    index: 1,
    type: 'hlKw',
    value: 'const',
    range: makeHighlightTokenRange({ startPosition: { line: 1, column: 8 } }),
  }),
];

describe('TokenTableSection', () => {
  it('renders token rows', () => {
    render(
      <TokenTableSection
        tokens={tokens}
        filteredTokens={tokens}
        searchTerm=""
        setSearchTerm={vi.fn()}
        typeFilter="All"
        setTypeFilter={vi.fn()}
        presentTypes={['All', 'hlKw']}
      />,
    );

    expect(screen.getByText('export')).toBeDefined();
    expect(screen.getByText('const')).toBeDefined();
    expect(screen.getByText('2 highlighted spans')).toBeDefined();
  });

  it('filters via search input', () => {
    const setSearchTerm = vi.fn();
    render(
      <TokenTableSection
        tokens={tokens}
        filteredTokens={[tokens[1]!]}
        searchTerm="const"
        setSearchTerm={setSearchTerm}
        typeFilter="All"
        setTypeFilter={vi.fn()}
        presentTypes={['All', 'hlKw']}
      />,
    );

    expect(screen.getByText('Showing 1 of 2 spans')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Filter tokens'), { target: { value: 'x' } });
    expect(setSearchTerm).toHaveBeenCalled();
  });

  it('shows empty state when no matches', () => {
    render(
      <TokenTableSection
        tokens={tokens}
        filteredTokens={[]}
        searchTerm="zzz"
        setSearchTerm={vi.fn()}
        typeFilter="All"
        setTypeFilter={vi.fn()}
        presentTypes={['All']}
      />,
    );

    expect(screen.getByText('No tokens match your search criteria.')).toBeDefined();
  });
});
