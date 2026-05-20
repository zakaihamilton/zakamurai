import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('renders processing message when isAIProcessing is true', () => {
    vi.spyOn(LogState, 'useState').mockReturnValue({
      logs: [],
      isAIProcessing: true,
      isSystemProcessing: false,
    });

    render(<LogArea />);
    expect(screen.getByText('AI is working...')).toBeDefined();
  });

  it('filters logs by partial matches', async () => {
    vi.spyOn(LogState, 'useState').mockReturnValue({
      logs: [
        { id: 1, role: 'system', text: 'Project compiled successfully', timestamp: '12:00:00' },
        { id: 2, role: 'ai', text: 'Updated Header.jsx', timestamp: '12:00:01' },
      ],
      isAIProcessing: false,
      isSystemProcessing: false,
    });

    render(<LogArea />);
    fireEvent.change(screen.getByLabelText('Filter logs'), { target: { value: 'header' } });

    await waitFor(() => expect(screen.queryByText('Project compiled successfully')).toBeNull());
    expect(screen.getByText('Updated Header.jsx')).toBeDefined();
  });
});
