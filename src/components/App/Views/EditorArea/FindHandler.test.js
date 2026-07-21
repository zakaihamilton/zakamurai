import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FindHandler from './FindHandler';

describe('FindHandler', () => {
  const createProps = (overrides = {}) => {
    const scrollContainerRef = { current: { scrollTo: vi.fn() } };
    return {
      localContent: 'hello foo\nfoo bar',
      scrollContainerRef,
      showFind: true,
      setShowFind: vi.fn(),
      findQuery: 'foo',
      setFindQuery: vi.fn(),
      replaceQuery: 'baz',
      setReplaceQuery: vi.fn(),
      matchIndex: 0,
      setMatchIndex: vi.fn(),
      matches: [],
      setMatches: vi.fn(),
      handleChange: vi.fn(),
      ...overrides,
    };
  };

  it('finds matches when shown and scrolls to the active match', () => {
    const props = createProps({
      matches: [{ line: 2, absoluteIndex: 10, length: 3 }],
      matchIndex: 0,
    });

    render(<FindHandler {...props} />);

    expect(props.setMatches).toHaveBeenCalledWith([
      { line: 1, index: 6, absoluteIndex: 6, length: 3 },
      { line: 2, index: 0, absoluteIndex: 10, length: 3 },
    ]);
    expect(props.scrollContainerRef.current.scrollTo).toHaveBeenCalled();
  });

  it('clears matches when the query is empty', () => {
    const props = createProps({ findQuery: '' });
    render(<FindHandler {...props} />);

    expect(props.setMatches).toHaveBeenCalledWith([]);
    expect(props.setMatchIndex).toHaveBeenCalledWith(-1);
  });

  it('replaces the current match and all matches', () => {
    const props = createProps({
      matches: [
        { line: 1, index: 6, absoluteIndex: 6, length: 3 },
        { line: 2, index: 0, absoluteIndex: 10, length: 3 },
      ],
      matchIndex: 0,
    });

    render(<FindHandler {...props} />);

    fireEvent.click(screen.getByText('Replace'));
    expect(props.handleChange).toHaveBeenCalledWith({
      target: { value: 'hello baz\nfoo bar' },
    });

    fireEvent.click(screen.getByText('All'));
    expect(props.handleChange).toHaveBeenCalledWith({
      target: { value: 'hello baz\nbaz bar' },
    });
    expect(props.setShowFind).toHaveBeenCalledWith(false);
  });

  it('toggles find with Ctrl/Cmd+F', () => {
    const props = createProps({ showFind: false });
    render(<FindHandler {...props} />);

    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    expect(props.setShowFind).toHaveBeenCalled();
  });
});
