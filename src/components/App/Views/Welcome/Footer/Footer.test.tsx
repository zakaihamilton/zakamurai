import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import WelcomeFooter from './Footer';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Github: () => <span />,
    Linkedin: () => <span />,
  },
}));

describe('WelcomeFooter', () => {
  it('renders footer links', () => {
    render(<WelcomeFooter />);
    expect(screen.getByText('Zakai Hamilton')).toBeDefined();
    expect(screen.getByRole('link', { name: 'GitHub repository' }).getAttribute('href')).toBe(
      'https://github.com/zakaihamilton/zakamurai',
    );
    expect(screen.getByRole('link', { name: 'LinkedIn profile' }).getAttribute('href')).toBe(
      'https://www.linkedin.com/in/zakai-hamilton',
    );
  });
});
