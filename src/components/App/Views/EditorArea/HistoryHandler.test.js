import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HistoryHandler from './HistoryHandler';

describe('HistoryHandler', () => {
  let state;
  let setLocalContent;
  const filePath = 'test.js';

  beforeEach(() => {
    vi.useFakeTimers();
    state = vi.fn();
    state.fileContents = {};
    state.cursorPos = {};
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
});
