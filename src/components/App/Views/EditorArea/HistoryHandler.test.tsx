import { createMockEditorState } from '@/test-utils/editorMocks';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HistoryHandler from './HistoryHandler';

describe('HistoryHandler', () => {
  const filePath = 'test.js';
  let state: ReturnType<typeof createMockEditorState>;

  beforeEach(() => {
    vi.useFakeTimers();
    state = createMockEditorState({
      fileContents: {},
      cursorPos: {},
      history: {},
    });
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

    localContent = 'changed';
    state.fileContents[filePath] = localContent;
    rerender(<HistoryHandler filePath={filePath} localContent={localContent} state={state} />);

    expect(state).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

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

    vi.runAllTimers();
    expect(state.history?.[filePath]).toBeUndefined();

    state.cursorPos[filePath] = { line: 1, col: 4, index: 3 };
    state.fileContents[filePath] = 'abc';
    rerender(<HistoryHandler filePath={filePath} localContent="abc" state={state} />);

    vi.advanceTimersByTime(300);

    expect(state.history?.[filePath]?.lastSnapshotCursor?.index).toBe(3);
    expect(state.history?.[filePath]?.past[0]?.cursor.index).toBe(0);
  });
});
