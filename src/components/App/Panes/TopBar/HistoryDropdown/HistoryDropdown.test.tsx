import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HistoryDropdown from './HistoryDropdown';

const history = {
  currentIndex: 1,
  stack: [
    { filePath: 'src/a.js', label: 'a.js', loc: { line: 1, col: 1, index: 0 } },
    { filePath: 'src/b.js', label: 'b.js', loc: { line: 10, col: 1, index: 0 } },
  ],
};

describe('HistoryDropdown', () => {
  it('returns null when closed or empty', () => {
    const { container: closed } = render(
      <HistoryDropdown
        isOpen={false}
        onClose={vi.fn()}
        history={history}
        onItemClick={vi.fn()}
        onClearHistory={vi.fn()}
      />,
    );
    expect(closed.firstChild).toBeNull();

    const { container: empty } = render(
      <HistoryDropdown
        isOpen={true}
        onClose={vi.fn()}
        history={{ stack: [], currentIndex: -1 }}
        onItemClick={vi.fn()}
        onClearHistory={vi.fn()}
      />,
    );
    expect(empty.firstChild).toBeNull();
  });

  it('renders history items newest-first and marks the active item', () => {
    render(
      <HistoryDropdown
        isOpen={true}
        onClose={vi.fn()}
        history={history}
        onItemClick={vi.fn()}
        onClearHistory={vi.fn()}
      />,
    );

    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveTextContent('b.js');
    expect(items[0]).toHaveTextContent('L10');
    expect(items[1]).toHaveTextContent('a.js');
    expect(screen.getByTestId('history-item-1').className).toMatch(/activeHistoryItem/);
  });

  it('invokes callbacks for overlay, clear, and item click', () => {
    const onClose = vi.fn();
    const onClearHistory = vi.fn();
    const onItemClick = vi.fn();

    render(
      <HistoryDropdown
        isOpen={true}
        onClose={onClose}
        history={history}
        onItemClick={onItemClick}
        onClearHistory={onClearHistory}
      />,
    );

    fireEvent.click(screen.getByTestId('history-dropdown-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByTestId('history-dropdown-overlay'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByTestId('clear-history-button'));
    expect(onClearHistory).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('history-item-0'));
    expect(onItemClick).toHaveBeenCalledWith(0);
  });
});
