import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ZakamuraiState } from '../State';
import LogArea from './LogArea';

// Mock scrollIntoView since it's not implemented in jsdom
window.HTMLElement.prototype.scrollIntoView = vi.fn();

vi.mock('../State', () => ({
  ZakamuraiState: {
    useState: vi.fn(),
  },
}));

describe('LogArea', () => {
  it('renders logs', () => {
    ZakamuraiState.useState.mockReturnValue({
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
    ZakamuraiState.useState.mockReturnValue({
      logs: [],
      isProcessing: true,
    });

    render(<LogArea />);
    expect(screen.getByText('Generating architecture scaffolding...')).toBeDefined();
  });
});
