import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TokenSummaryCards from './TokenSummaryCards';

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Code: () => <span data-testid="icon-code" />,
    Tokens: () => <span data-testid="icon-tokens" />,
    Terminal: () => <span data-testid="icon-terminal" />,
    ChevronDown: () => <span data-testid="icon-chevrondown" />,
    Globe: () => <span data-testid="icon-globe" />,
    Search: () => <span data-testid="icon-search" />,
  },
}));

const mockReport = {
  languageMode: 'javascript',
  tokens: [{ type: 'hlKw', value: 'const' }],
  lineCount: 10,
  folds: [{ id: 'fold1' }],
  navigationTargets: [{ name: 'foo' }],
  search: { matchCount: 2 },
};

describe('TokenSummaryCards', () => {
  it('renders summary values from report', () => {
    render(<TokenSummaryCards report={mockReport} />);

    expect(screen.getByLabelText('Token breakdown summary')).toBeDefined();
    expect(screen.getByText('javascript')).toBeDefined();
    expect(screen.getByText('10')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('Mode')).toBeDefined();
    expect(screen.getByText('Tokens')).toBeDefined();
    expect(screen.getByText('Lines')).toBeDefined();
    expect(screen.getByText('Folds')).toBeDefined();
    expect(screen.getByText('Nav Targets')).toBeDefined();
    expect(screen.getByText('Search Matches')).toBeDefined();
  });
});
