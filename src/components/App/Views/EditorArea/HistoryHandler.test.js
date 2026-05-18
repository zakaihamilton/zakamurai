import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HistoryHandler from './HistoryHandler';

describe('HistoryHandler', () => {
  let state;
  const filePath = 'test.js';

  beforeEach(() => {
    vi.useFakeTimers();
    state = vi.fn((updateFn) => {
      if (typeof updateFn === 'function') {
        const draft = {
          history: state.history || {},
          fileContents: state.fileContents || {},
          cursorPos: state.cursorPos || {},
        };
        updateFn(draft);
        state.history = draft.history;
        state.fileContents = draft.fileContents;
        state.cursorPos = draft.cursorPos;
      }
    });
    state.fileContents = {};
    state.cursorPos = {};
    state.history = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does not update local content from history bookkeeping', () => {
    state.fileContents[filePath] = 'initial content';
    state.cursorPos[filePath] = { line: 1, col: 1, index: 0 };

    render(<HistoryHandler filePath={filePath} localContent="" state={state} />);

    expect(state).not.toHaveBeenCalled();
  });

  it('debounces history snapshots when local content changes', () => {
    state.fileContents[filePath] = 'initial';
    let localContent = 'initial';

    const { rerender } = render(
      <HistoryHandler filePath={filePath} localContent={localContent} state={state} />,
    );

    // Change local content
    localContent = 'changed';
    state.fileContents[filePath] = localContent;
    rerender(<HistoryHandler filePath={filePath} localContent={localContent} state={state} />);

    // Should not have updated state yet (debounced)
    expect(state).not.toHaveBeenCalled();

    // Fast forward time
    vi.advanceTimersByTime(300);

    // Now it should have been called to push to history
    expect(state).toHaveBeenCalledTimes(1);
  });

  it('updates history refs without writing state when switching files', () => {
    state.fileContents['file1.js'] = 'content 1';
    state.fileContents['file2.js'] = 'content 2';

    const { rerender } = render(
      <HistoryHandler filePath="file1.js" localContent="content 1" state={state} />,
    );

    rerender(<HistoryHandler filePath="file2.js" localContent="content 1" state={state} />);

    expect(state).not.toHaveBeenCalled();
  });

  it('correctly captures the cursor position for the last snapshot', () => {
    state.fileContents[filePath] = 'initial';
    state.cursorPos[filePath] = { line: 1, col: 1, index: 0 };

    const { rerender } = render(
      <HistoryHandler filePath={filePath} localContent="" state={state} />,
    );

    // Opening a file syncs local state without writing global history.
    vi.runAllTimers();
    expect(state.history[filePath]).toBeUndefined();

    // User types "abc", cursor moves to 3
    state.cursorPos[filePath] = { line: 1, col: 4, index: 3 };
    state.fileContents[filePath] = 'abc';
    rerender(<HistoryHandler filePath={filePath} localContent="abc" state={state} />);

    // Snapshot triggers after 300ms
    vi.advanceTimersByTime(300);

    // The snapshot should have captured the cursor position after typing "abc"
    expect(state.history[filePath].lastSnapshotCursor.index).toBe(3);
    // The "past" entry should have captured the cursor position BEFORE typing "abc"
    expect(state.history[filePath].past[0].cursor.index).toBe(0);
  });
});
