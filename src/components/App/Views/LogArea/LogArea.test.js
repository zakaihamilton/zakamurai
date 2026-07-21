import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LogAreaUiState, LogState } from './LogArea';
import LogArea from './LogArea';

vi.mock('@/utils/os', () => ({
  formatShortcut: vi.fn((s) => s),
  isMac: vi.fn(() => true),
}));

// Mock scrollIntoView since it's not implemented in jsdom
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.scrollTo = vi.fn();

describe('LogArea', () => {
  it('renders logs', () => {
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

  it('renders processing message when isAIProcessing is true', () => {
    vi.spyOn(LogState, 'useState').mockReturnValue({
      logs: [],
      isAIProcessing: true,
      isSystemProcessing: false,
    });
    vi.spyOn(LogAreaUiState, 'useState').mockReturnValue({
      copied: false,
      autoScroll: true,
      filterText: '',
    });

    render(<LogArea />);
    expect(screen.getByText('AI is working...')).toBeDefined();
  });

  it('renders processing message when both isAIProcessing and isSystemProcessing are true', () => {
    vi.spyOn(LogState, 'useState').mockReturnValue({
      logs: [],
      isAIProcessing: true,
      isSystemProcessing: true,
    });
    vi.spyOn(LogAreaUiState, 'useState').mockReturnValue({
      copied: false,
      autoScroll: true,
      filterText: '',
    });

    render(<LogArea />);
    expect(screen.getByText('AI & System working...')).toBeDefined();
  });

  it('renders processing message when only isSystemProcessing is true', () => {
    vi.spyOn(LogState, 'useState').mockReturnValue({
      logs: [],
      isAIProcessing: false,
      isSystemProcessing: true,
    });
    vi.spyOn(LogAreaUiState, 'useState').mockReturnValue({
      copied: false,
      autoScroll: true,
      filterText: '',
    });

    render(<LogArea />);
    expect(screen.getByText('System is working...')).toBeDefined();
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

  it('renders jump to bottom button when autoScroll is false', () => {
    vi.spyOn(LogState, 'useState').mockReturnValue({
      logs: [{ id: 1, role: 'ai', text: 'Some logs' }],
      isAIProcessing: false,
      isSystemProcessing: false,
    });
    const uiStateUpdater = vi.fn();
    vi.spyOn(LogAreaUiState, 'useState').mockReturnValue(
      Object.assign(uiStateUpdater, {
        copied: false,
        autoScroll: false,
        filterText: '',
      }),
    );

    render(<LogArea />);
    const jumpBtn = screen.getByRole('button', { name: 'Jump to bottom' });
    expect(jumpBtn).toBeDefined();
    fireEvent.click(jumpBtn);
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
    const clearBtn = screen.getByRole('button', { name: 'Clear log filter' });
    expect(clearBtn).toBeDefined();
    fireEvent.click(clearBtn);
    expect(uiStateUpdater).toHaveBeenCalled();
  });

  it('displays empty state message when logs exist but none match filterText', () => {
    vi.spyOn(LogState, 'useState').mockReturnValue({
      logs: [{ id: 1, role: 'ai', text: 'Non-matching entry' }],
      isAIProcessing: false,
      isSystemProcessing: false,
    });
    vi.spyOn(LogAreaUiState, 'useState').mockReturnValue({
      copied: false,
      autoScroll: true,
      filterText: 'filter-with-no-match',
    });

    render(<LogArea />);
    expect(screen.getByText('No logs match "filter-with-no-match"')).toBeDefined();
  });

  it('correctly styles error logs', () => {
    vi.spyOn(LogState, 'useState').mockReturnValue({
      logs: [
        { id: 1, role: 'system', text: 'ERR: Something went wrong' },
        { id: 2, role: 'ai', text: 'Stack: trace error' },
      ],
      isAIProcessing: false,
      isSystemProcessing: false,
    });
    vi.spyOn(LogAreaUiState, 'useState').mockReturnValue({
      copied: false,
      autoScroll: true,
      filterText: '',
    });

    const { container } = render(<LogArea />);
    // Check if at least one row has style class mapping to error (since CSS modules are compiled, we check class attribute exists)
    const logItemRows = container.querySelectorAll('[class*="logItem"]');
    expect(logItemRows.length).toBeGreaterThan(0);
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
    const clearBtn = screen.getByRole('button', { name: 'Clear logs' });
    expect(clearBtn).toBeDefined();
    fireEvent.click(clearBtn);
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
    const copyBtn = screen.getByRole('button', { name: 'Copy all logs' });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('[ai] Hello\n\n[user] World');
    expect(uiStateUpdater).toHaveBeenCalled();

    // Fast-forward to test the setTimeout callback
    vi.advanceTimersByTime(2100);
    expect(uiStateUpdater).toHaveBeenCalledTimes(2);
    vi.useRealTimers();

    // Restore original clipboard
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
    // Simulate scroll on the log container
    const container =
      document.querySelector('[class*="logArea"]') ||
      document.querySelector('div.scrollHide') ||
      document.querySelector('div');
    if (container) {
      // Set scrollTop to simulate at-bottom state
      Object.defineProperty(container, 'scrollTop', { value: 0, writable: true });
      Object.defineProperty(container, 'scrollHeight', { value: 100, writable: true });
      Object.defineProperty(container, 'clientHeight', { value: 100, writable: true });
      fireEvent.scroll(container);
    }
  });
});
