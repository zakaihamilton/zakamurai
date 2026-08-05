import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WelcomeHero from './Hero';

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    ZLogo: () => <span />,
  },
}));

describe('WelcomeHero', () => {
  it('renders hero content and intro steps', () => {
    render(<WelcomeHero />);
    expect(screen.getByText('Welcome to Zakamurai')).toBeDefined();
    expect(screen.getByText('Your AI coding workspace in the browser')).toBeDefined();
    expect(
      screen.getByText('Edit, prompt, build, and preview — all in one focused place.'),
    ).toBeDefined();
    expect(screen.getByText('Code')).toBeDefined();
    expect(screen.getByText('Preview')).toBeDefined();
  });
});
