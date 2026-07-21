import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FindReplaceBar from './FindReplaceBar';

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    ChevronDown: () => <span>Next</span>,
    ChevronUp: () => <span>Prev</span>,
    Close: () => <span>Close</span>,
  },
}));

describe('FindReplaceBar', () => {
  const baseProps = {
    showFind: true,
    setShowFind: vi.fn(),
    findQuery: 'foo',
    setFindQuery: vi.fn(),
    replaceQuery: 'bar',
    setReplaceQuery: vi.fn(),
    matches: [{ line: 1 }, { line: 2 }],
    matchIndex: 0,
    setMatchIndex: vi.fn(),
    handleFind: vi.fn(),
    handleReplace: vi.fn(),
    handleReplaceAll: vi.fn(),
  };

  it('returns null when hidden', () => {
    const { container } = render(<FindReplaceBar {...baseProps} showFind={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows match stats and wires find/replace actions', () => {
    const setFindQuery = vi.fn();
    const setReplaceQuery = vi.fn();
    const setMatchIndex = vi.fn();
    const setShowFind = vi.fn();
    const handleFind = vi.fn();
    const handleReplace = vi.fn();
    const handleReplaceAll = vi.fn();

    render(
      <FindReplaceBar
        {...baseProps}
        setFindQuery={setFindQuery}
        setReplaceQuery={setReplaceQuery}
        setMatchIndex={setMatchIndex}
        setShowFind={setShowFind}
        handleFind={handleFind}
        handleReplace={handleReplace}
        handleReplaceAll={handleReplaceAll}
      />,
    );

    expect(screen.getByText('1 / 2')).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText('Find...'), { target: { value: 'baz' } });
    expect(setFindQuery).toHaveBeenCalledWith('baz');

    fireEvent.keyDown(screen.getByPlaceholderText('Find...'), { key: 'Enter' });
    expect(handleFind).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Next'));
    expect(setMatchIndex).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Prev'));
    expect(setMatchIndex).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByText('Close'));
    expect(setShowFind).toHaveBeenCalledWith(false);

    fireEvent.change(screen.getByPlaceholderText('Replace with...'), {
      target: { value: 'qux' },
    });
    expect(setReplaceQuery).toHaveBeenCalledWith('qux');

    fireEvent.click(screen.getByText('Replace'));
    expect(handleReplace).toHaveBeenCalled();

    fireEvent.click(screen.getByText('All'));
    expect(handleReplaceAll).toHaveBeenCalled();
  });

  it('shows no results when there are no matches', () => {
    render(<FindReplaceBar {...baseProps} matches={[]} matchIndex={-1} />);
    expect(screen.getByText('No results')).toBeDefined();
  });
});
