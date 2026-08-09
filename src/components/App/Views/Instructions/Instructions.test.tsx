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
    expect(screen.getByText('A focused loop from idea to preview.')).toBeDefined();
    expect(screen.getByRole('heading', { name: /1\. Shape the workspace/ })).toBeDefined();
    expect(screen.getByRole('heading', { name: /2\. Collaborate with local AI/ })).toBeDefined();
    expect(screen.getByRole('heading', { name: /3\. Review every AI change/ })).toBeDefined();
    expect(screen.getByRole('heading', { name: /4\. Build, preview, and debug/ })).toBeDefined();
    expect(screen.getByText(/IndexedDB, with localStorage as a fallback/)).toBeDefined();
    expect(screen.getByText(/WebGPU and Web Workers are required/)).toBeDefined();
    expect(screen.getByText(/More Actions → Keyboard Shortcuts/)).toBeDefined();
  });
});
