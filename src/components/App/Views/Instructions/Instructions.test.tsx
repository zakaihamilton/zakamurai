import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Instructions from './Instructions';

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Folder: () => <span />,
    Bot: () => <span />,
    Play: () => <span />,
    Globe: () => <span />,
    Keyboard: () => <span />,
    Sparkles: () => <span />,
    Code: () => <span />,
    Search: () => <span />,
    Terminal: () => <span />,
    Info: () => <span />,
  },
}));

describe('Instructions', () => {
  it('renders instruction sections', () => {
    render(<Instructions />);
    expect(screen.getByText('Welcome to Zakamurai')).toBeDefined();
    expect(screen.getByRole('heading', { name: /1\. Project Structure/ })).toBeDefined();
    expect(screen.getByRole('heading', { name: /2\. AI Collaboration/ })).toBeDefined();
    expect(screen.getByRole('heading', { name: /3\. Build & Preview/ })).toBeDefined();
  });
});
