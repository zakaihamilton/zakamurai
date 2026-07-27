import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProjectInfo from './ProjectInfo';

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Sparkles: () => <span />,
    Code: () => <span />,
    Brain: () => <span />,
  },
}));

describe('ProjectInfo', () => {
  it('composes the project information sections', () => {
    render(<ProjectInfo />);
    expect(screen.getByText('Zakamurai')).toBeDefined();
    expect(screen.getByText('About the Project')).toBeDefined();
    expect(screen.getByText('Technologies')).toBeDefined();
    expect(screen.getByText('The Vision')).toBeDefined();
  });
});
