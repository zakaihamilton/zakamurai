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
    expect(screen.getByText('Zero setup. Full workspace.')).toBeDefined();
    expect(screen.getByText('Go from idea to running app—right in your browser.')).toBeDefined();
    expect(screen.getByText(/Edit code, collaborate with private local AI/)).toBeDefined();
    expect(screen.getByText('Open')).toBeDefined();
    expect(screen.getByText('Preview')).toBeDefined();
  });
});
