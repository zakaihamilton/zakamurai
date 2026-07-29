import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TokenFoldsSection from './TokenFoldsSection';

describe('TokenFoldsSection', () => {
  it('renders fold list with collapsed state', () => {
    const folds = [
      { id: 'fold-1', startLine: 1, endLine: 5, placeholder: '...' },
      { id: 'fold-2', startLine: 10, endLine: 12 },
    ];
    render(<TokenFoldsSection folds={folds} foldLabel="JS" collapsedFoldIds={['fold-1']} />);

    expect(screen.getByText('Folds')).toBeDefined();
    expect(screen.getByText('fold-1')).toBeDefined();
    expect(screen.getByText(/JS: 1-5/)).toBeDefined();
    expect(screen.getByText(/collapsed/)).toBeDefined();
  });

  it('shows empty state when no folds', () => {
    render(<TokenFoldsSection folds={[]} foldLabel="JS" collapsedFoldIds={[]} />);
    expect(screen.getByText('No folds detected.')).toBeDefined();
  });
});
