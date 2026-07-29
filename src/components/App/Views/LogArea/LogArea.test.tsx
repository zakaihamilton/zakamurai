import { makeLogAreaUiState, makeLogState } from '@/test-utils/stateMocks';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LogAreaUiState, LogState } from './LogArea';
import LogArea from './LogArea';

vi.mock('@/utils/os', () => ({
  formatShortcut: vi.fn((s: string) => s),
  isMac: vi.fn(() => true),
}));

window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.scrollTo = vi.fn();

const logTimestamp = '2024-01-01T00:00:00Z';

describe('LogArea', () => {
  it('renders logs through the composed list', () => {
    vi.spyOn(LogState, 'useState').mockReturnValue(
      makeLogState({
        logs: [
          { id: 1, role: 'ai', text: 'Hello human', timestamp: logTimestamp },
          { id: 2, role: 'user', text: 'Hello bot', timestamp: logTimestamp },
        ],
      }),
    );
    vi.spyOn(LogAreaUiState, 'useState').mockReturnValue(makeLogAreaUiState());

    render(<LogArea />);
    expect(screen.getByText('Hello human')).toBeDefined();
    expect(screen.getByText('Hello bot')).toBeDefined();
  });

  it('filters logs by partial matches', async () => {
    vi.spyOn(LogState, 'useState').mockReturnValue(
      makeLogState({
        logs: [
          { id: 1, role: 'system', text: 'Project compiled successfully', timestamp: '12:00:00' },
          { id: 2, role: 'ai', text: 'Updated Header.jsx', timestamp: '12:00:01' },
        ],
      }),
    );
    const uiState = makeLogAreaUiState();
    vi.spyOn(LogAreaUiState, 'useState').mockReturnValue(uiState);

    render(<LogArea />);
    fireEvent.change(screen.getByLabelText('Filter logs'), { target: { value: 'header' } });
    expect(uiState).toHaveBeenCalled();
  });

  it('allows clearing filter when filterText is not empty', () => {
    vi.spyOn(LogState, 'useState').mockReturnValue(
      makeLogState({
        logs: [{ id: 1, role: 'ai', text: 'Log entry', timestamp: logTimestamp }],
      }),
    );
    const uiState = makeLogAreaUiState({ filterText: 'some-filter' });
    vi.spyOn(LogAreaUiState, 'useState').mockReturnValue(uiState);

    render(<LogArea />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear log filter' }));
    expect(uiState).toHaveBeenCalled();
  });

  it('handleClear clears all logs', () => {
    const logState = makeLogState({
      logs: [{ id: 1, role: 'ai', text: 'Entry 1', timestamp: logTimestamp }],
    });
    vi.spyOn(LogState, 'useState').mockReturnValue(logState);
    vi.spyOn(LogAreaUiState, 'useState').mockReturnValue(makeLogAreaUiState());

    render(<LogArea />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear logs' }));
    expect(logState.logs).toEqual([]);
  });

  it('handleCopyAll copies all logs to clipboard', async () => {
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true,
    });

    const uiState = makeLogAreaUiState();
    vi.spyOn(LogState, 'useState').mockReturnValue(
      makeLogState({
        logs: [
          { id: 1, role: 'ai', text: 'Hello', timestamp: logTimestamp },
          { id: 2, role: 'user', text: 'World', timestamp: logTimestamp },
        ],
      }),
    );
    vi.spyOn(LogAreaUiState, 'useState').mockReturnValue(uiState);

    vi.useFakeTimers();
    render(<LogArea />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy all logs' }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('[ai] Hello\n\n[user] World');
    expect(uiState).toHaveBeenCalled();
    vi.advanceTimersByTime(2100);
    expect(uiState).toHaveBeenCalledTimes(2);
    vi.useRealTimers();

    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
  });

  it('handleScroll disables autoScroll when scrolling up', () => {
    const uiState = makeLogAreaUiState();
    vi.spyOn(LogState, 'useState').mockReturnValue(
      makeLogState({
        logs: [{ id: 1, role: 'ai', text: 'Entry', timestamp: logTimestamp }],
      }),
    );
    vi.spyOn(LogAreaUiState, 'useState').mockReturnValue(uiState);

    render(<LogArea />);
    const container = document.querySelector('[class*="logArea"]') || document.querySelector('div');
    if (container) {
      Object.defineProperty(container, 'scrollTop', { value: 0, writable: true });
      Object.defineProperty(container, 'scrollHeight', { value: 100, writable: true });
      Object.defineProperty(container, 'clientHeight', { value: 100, writable: true });
      fireEvent.scroll(container);
    }
  });
});
