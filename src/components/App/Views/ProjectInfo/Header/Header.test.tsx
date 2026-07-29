import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProjectHeader from './Header';

describe('ProjectHeader', () => {
  it('renders the project title and pitch', () => {
    render(<ProjectHeader />);
    expect(screen.getByText('Zakamurai')).toBeDefined();
    expect(screen.getByText(/ultimate browser-based coding companion/)).toBeDefined();
  });
});
