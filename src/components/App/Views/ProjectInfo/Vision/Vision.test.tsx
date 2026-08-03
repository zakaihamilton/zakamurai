import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProjectVision from './Vision';

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Brain: () => <span />,
  },
}));

describe('ProjectVision', () => {
  it('renders the vision section copy', () => {
    render(<ProjectVision />);
    expect(screen.getByText('The Vision')).toBeDefined();
    expect(screen.getByText(/distance between an idea and a working experiment/)).toBeDefined();
  });
});
