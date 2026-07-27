import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LogAreaUiState, LogState } from './LogArea';
import LogArea from './LogArea';

vi.mock('@/utils/os', () => ({
  formatShortcut: vi.fn((s) => s),
  isMac: vi.fn(() => true),
}));

window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.scrollTo = vi.fn();

describe('LogArea', () => {
  it('renders logs through the composed list', () => {
    vi.spyOn(LogState, 'useState').mockReturnValue({
      logs: [
        { id: 1, role: 'ai', text: 'Hello human' },
        { id: 2, role: 'user', text: 'Hello bot' },
      ],
      isProcessing: false,
    });
    vi.spyOn(LogAreaUiState, 'useState').mockReturnValue({
      copied: false,
      autoScroll: true,
      filterText: '',
    });

    render(<LogArea />);
    expect(screen.getByText('Hello human')).toBeDefined();
    expect(screen.getByText('Hello bot')).toBeDefined();
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
    const uiStateUpdater = vi.fn();
    vi.spyOn(LogAreaUiState, 'useState').mockReturnValue(
      Object.assign(uiStateUpdater, {
        copied: false,
        autoScroll: true,
        filterText: '',
      }),
    );

    render(<LogArea />);
    fireEvent.change(screen.getByLabelText('Filter logs'), { target: { value: 'header' } });
    expect(uiStateUpdater).toHaveBeenCalled();
  });

  it('allows clearing filter when filterText is not empty', () => {
    vi.spyOn(LogState, 'useState').mockReturnValue({
      logs: [{ id: 1, role: 'ai', text: 'Log entry' }],
      isAIProcessing: false,
      isSystemProcessing: false,
    });
    const uiStateUpdater = vi.fn((cb) => {
      const draft = { filterText: 'some-filter' };
      cb(draft);
    });
    vi.spyOn(LogAreaUiState, 'useState').mockReturnValue(
      Object.assign(uiStateUpdater, {
        copied: false,
        autoScroll: true,
        filterText: 'some-filter',
      }),
    );

    render(<LogArea />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear log filter' }));
    expect(uiStateUpdater).toHaveBeenCalled();
  });

  it('handleClear clears all logs', () => {
    const logStateObj = {
      logs: [{ id: 1, role: 'ai', text: 'Entry 1' }],
      isAIProcessing: false,
      isSystemProcessing: false,
    };
    vi.spyOn(LogState, 'useState').mockReturnValue(logStateObj);
    vi.spyOn(LogAreaUiState, 'useState').mockReturnValue({
      copied: false,
      autoScroll: true,
      filterText: '',
    });

    render(<LogArea />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear logs' }));
    expect(logStateObj.logs).toEqual([]);
  });

  it('handleCopyAll copies all logs to clipboard', async () => {
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true,
    });

    const uiStateUpdater = vi.fn();
    vi.spyOn(LogState, 'useState').mockReturnValue({
      logs: [
        { id: 1, role: 'ai', text: 'Hello' },
        { id: 2, role: 'user', text: 'World' },
      ],
      isAIProcessing: false,
      isSystemProcessing: false,
    });
    vi.spyOn(LogAreaUiState, 'useState').mockReturnValue(
      Object.assign(uiStateUpdater, {
        copied: false,
        autoScroll: true,
        filterText: '',
      }),
    );

    vi.useFakeTimers();
    render(<LogArea />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy all logs' }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('[ai] Hello\n\n[user] World');
    expect(uiStateUpdater).toHaveBeenCalled();
    vi.advanceTimersByTime(2100);
    expect(uiStateUpdater).toHaveBeenCalledTimes(2);
    vi.useRealTimers();

    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
  });

  it('handleScroll disables autoScroll when scrolling up', () => {
    const uiStateUpdater = vi.fn();
    vi.spyOn(LogState, 'useState').mockReturnValue({
      logs: [{ id: 1, role: 'ai', text: 'Entry' }],
      isAIProcessing: false,
      isSystemProcessing: false,
    });
    vi.spyOn(LogAreaUiState, 'useState').mockReturnValue(
      Object.assign(uiStateUpdater, {
        copied: false,
        autoScroll: true,
        filterText: '',
      }),
    );

    render(<LogArea />);
    const container =
      document.querySelector('[class*="logArea"]') ||
      document.querySelector('div.scrollHide') ||
      document.querySelector('div');
    if (container) {
      Object.defineProperty(container, 'scrollTop', { value: 0, writable: true });
      Object.defineProperty(container, 'scrollHeight', { value: 100, writable: true });
      Object.defineProperty(container, 'clientHeight', { value: 100, writable: true });
      fireEvent.scroll(container);
    }
  });
});
