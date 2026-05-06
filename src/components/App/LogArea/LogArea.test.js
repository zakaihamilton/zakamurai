import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LogState } from './LogArea';
import LogArea from './LogArea';

// Mock scrollIntoView since it's not implemented in jsdom
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// No need to mock LogArea itself
describe('LogArea', () => {
  it('renders logs', () => {
    vi.spyOn(LogState, 'useState').mockReturnValue({
      logs: [
        { id: 1, role: 'ai', text: 'Hello human' },
        { id: 2, role: 'user', text: 'Hello bot' },
      ],
      isProcessing: false,
    });

    render(<LogArea />);
    expect(screen.getByText('Hello human')).toBeDefined();
    expect(screen.getByText('Hello bot')).toBeDefined();
  });

  it('renders processing message when isProcessing is true', () => {
    vi.spyOn(LogState, 'useState').mockReturnValue({
      logs: [],
      isProcessing: true,
    });

    render(<LogArea />);
    expect(screen.getByText('Compiling project...')).toBeDefined();
  });
});
