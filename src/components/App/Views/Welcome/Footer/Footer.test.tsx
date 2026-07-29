import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
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
    const links = screen.getAllByRole('link');
    expect(links[0].getAttribute('href')).toBe('https://github.com/zakaihamilton/zakamurai');
    expect(links[1].getAttribute('href')).toBe('https://www.linkedin.com/in/zakai-hamilton');
  });
});
