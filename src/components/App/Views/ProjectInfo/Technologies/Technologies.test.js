import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import ProjectTechnologies from './Technologies';

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Code: () => <span />,
  },
}));

describe('ProjectTechnologies', () => {
  it('renders technology section header and tech cards', () => {
    render(<ProjectTechnologies />);

    expect(screen.getByText('Technologies')).toBeDefined();
    expect(screen.getByText('Next.js & React')).toBeDefined();
    expect(screen.getByText('CSS Modules')).toBeDefined();
    expect(screen.getByText('almostnode')).toBeDefined();
  });
});
