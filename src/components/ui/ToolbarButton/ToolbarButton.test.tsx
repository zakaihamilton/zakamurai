import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ToolbarButton from './ToolbarButton';

describe('ToolbarButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders button and responds to click with pressed and completed attributes', async () => {
    const onClick = vi.fn();
    render(
      <ToolbarButton onClick={onClick} aria-label="Format code" tooltip="Format code">
        <span>Format</span>
      </ToolbarButton>,
    );

    const button = screen.getByRole('button', { name: 'Format code' });
    expect(button).toBeDefined();
    expect(button.getAttribute('data-completed')).toBe('false');

    await act(async () => {
      fireEvent.click(button);
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('data-completed')).toBe('true');

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(button.getAttribute('data-completed')).toBe('false');
  });

  it('retains original icon and sets completed pulse attribute on process completion', async () => {
    const onClick = vi.fn();
    render(
      <ToolbarButton onClick={onClick} aria-label="Refresh">
        <span data-testid="initial-icon">Refresh</span>
      </ToolbarButton>,
    );

    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(screen.getByTestId('initial-icon')).toBeDefined();
    expect(button.getAttribute('data-completed')).toBe('false');

    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByTestId('initial-icon')).toBeDefined();
    expect(button.getAttribute('data-completed')).toBe('true');

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(button.getAttribute('data-completed')).toBe('false');
  });
});
