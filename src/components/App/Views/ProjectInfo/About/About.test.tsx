import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProjectAbout from './About';

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Sparkles: () => <span />,
  },
}));

describe('ProjectAbout', () => {
  it('renders the about section copy', () => {
    render(<ProjectAbout />);
    expect(screen.getByText('About the Project')).toBeDefined();
    expect(screen.getByText(/browser-based development workspace/)).toBeDefined();
    expect(screen.getByText(/IndexedDB is used when available/)).toBeDefined();
  });
});
