import type { NavigationTarget } from '@/utils/navigation/types';
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
    render(
      <TokenNavigationSection
        navigationTargets={targets as unknown as NavigationTarget[]}
        navigationLinksEnabled={true}
      />,
    );

    expect(screen.getByText('Navigation Targets')).toBeDefined();
    expect(screen.getByText('enabled')).toBeDefined();
    expect(screen.getByText('import')).toBeDefined();
    expect(screen.getByText(/react at 1:1/)).toBeDefined();
  });

  it('handles fallback target names and positions', () => {
    const targets = [
      {
        className: 'MyClass',
        start: 0,
        end: 5,
      },
      {
        name: 'someText',
        start: 10,
        end: 15,
      },
      {
        start: 20,
        end: 25,
      },
    ];
    render(
      <TokenNavigationSection
        navigationTargets={targets as unknown as NavigationTarget[]}
        navigationLinksEnabled={true}
      />,
    );

    expect(screen.getByText(/MyClass at -:-/)).toBeDefined();
    expect(screen.getByText(/someText at -:-/)).toBeDefined();
    expect(screen.getByText(/unnamed at -:-/)).toBeDefined();
  });

  it('shows empty state when no targets', () => {
    render(<TokenNavigationSection navigationTargets={[]} navigationLinksEnabled={false} />);
    expect(screen.getByText('disabled')).toBeDefined();
    expect(screen.getByText('No navigation targets detected.')).toBeDefined();
  });
});
