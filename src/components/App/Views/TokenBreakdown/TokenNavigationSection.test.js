import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TokenNavigationSection from './TokenNavigationSection';

describe('TokenNavigationSection', () => {
  it('renders navigation targets', () => {
    const targets = [
      {
        type: 'import',
        name: 'react',
        text: 'react',
        position: { line: 1, column: 1 },
        start: 0,
        end: 10,
      },
    ];
    render(<TokenNavigationSection navigationTargets={targets} navigationLinksEnabled={true} />);

    expect(screen.getByText('Navigation Targets')).toBeDefined();
    expect(screen.getByText('enabled')).toBeDefined();
    expect(screen.getByText('import')).toBeDefined();
    expect(screen.getByText(/react at 1:1/)).toBeDefined();
  });

  it('shows empty state when no targets', () => {
    render(<TokenNavigationSection navigationTargets={[]} navigationLinksEnabled={false} />);
    expect(screen.getByText('disabled')).toBeDefined();
    expect(screen.getByText('No navigation targets detected.')).toBeDefined();
  });
});
