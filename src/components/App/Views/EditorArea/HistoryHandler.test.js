import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HistoryHandler from './HistoryHandler';

describe('HistoryHandler', () => {
  let state;
  let setLocalContent;
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
    setLocalContent = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('initializes local content from global state', () => {
    state.fileContents[filePath] = 'initial content';
    state.cursorPos[filePath] = { line: 1, col: 1, index: 0 };

    render(
      <HistoryHandler
        filePath={filePath}
        localContent=""
        setLocalContent={setLocalContent}
        state={state}
      />,
    );

    expect(setLocalContent).toHaveBeenCalledWith('initial content');
    // Check if state was called to initialize history
    expect(state).toHaveBeenCalled();
  });

  it('debounces history snapshots when local content changes', () => {
    state.fileContents[filePath] = 'initial';
    let localContent = 'initial';

    const { rerender } = render(
      <HistoryHandler
        filePath={filePath}
        localContent={localContent}
        setLocalContent={setLocalContent}
        state={state}
      />,
    );

    // Change local content
    localContent = 'changed';
    rerender(
      <HistoryHandler
        filePath={filePath}
        localContent={localContent}
        setLocalContent={setLocalContent}
        state={state}
      />,
    );

    // Should not have updated state yet (debounced)
    expect(state).toHaveBeenCalledTimes(1); // Only initial call

    // Fast forward time
    vi.advanceTimersByTime(300);

    // Now it should have been called to push to history
    expect(state).toHaveBeenCalledTimes(2);
  });

  it('resets local content when switching files', () => {
    state.fileContents['file1.js'] = 'content 1';
    state.fileContents['file2.js'] = 'content 2';

    // Initial render with matching content shouldn't call setLocalContent
    const { rerender } = render(
      <HistoryHandler
        filePath="file1.js"
        localContent="content 1"
        setLocalContent={setLocalContent}
        state={state}
      />,
    );

    expect(setLocalContent).not.toHaveBeenCalled();

    // Rerender with a different filePath
    rerender(
      <HistoryHandler
        filePath="file2.js"
        localContent="content 1"
        setLocalContent={setLocalContent}
        state={state}
      />,
    );

    // Should be called because fileSwitched is true
    expect(setLocalContent).toHaveBeenCalledWith('content 2');
  });

  it('correctly captures the cursor position for the last snapshot', () => {
    state.fileContents[filePath] = 'initial';
    state.cursorPos[filePath] = { line: 1, col: 1, index: 0 };

    const { rerender } = render(
      <HistoryHandler
        filePath={filePath}
        localContent=""
        setLocalContent={setLocalContent}
        state={state}
      />,
    );

    // Initial snapshot happens on mount because localContent ("") !== globalContent ("initial")
    vi.runAllTimers();
    expect(state.history[filePath]).toBeDefined();
    expect(state.history[filePath].lastSnapshotCursor.index).toBe(0);

    // User types "abc", cursor moves to 3
    state.cursorPos[filePath] = { line: 1, col: 4, index: 3 };
    rerender(
      <HistoryHandler
        filePath={filePath}
        localContent="abc"
        setLocalContent={setLocalContent}
        state={state}
      />,
    );

    // Snapshot triggers after 300ms
    vi.advanceTimersByTime(300);

    // The snapshot should have captured the cursor position after typing "abc"
    expect(state.history[filePath].lastSnapshotCursor.index).toBe(3);
    // The "past" entry should have captured the cursor position BEFORE typing "abc"
    expect(state.history[filePath].past[0].cursor.index).toBe(0);
  });
});
