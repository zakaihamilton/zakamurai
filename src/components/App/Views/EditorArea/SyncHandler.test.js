import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SyncHandler from './SyncHandler';

describe('SyncHandler', () => {
  let fs;
  let state;
  let tabState;
  const filePath = 'test.js';
  let writableMock;
  let handleMock;

  beforeEach(() => {
    vi.useFakeTimers();
    fs = { mode: 'local' };
    state = vi.fn();
    state.fileContents = {};
    state.pendingDiffs = {};

    writableMock = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    handleMock = {
      createWritable: vi.fn().mockResolvedValue(writableMock),
    };

    tabState = {
      openTabs: [{ id: filePath, fsHandle: handleMock }],
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('auto-saves content after 1000ms delay', async () => {
    const { rerender } = render(
      <SyncHandler
        fs={fs}
        filePath={filePath}
        localContent="initial"
        state={state}
        tabState={tabState}
      />,
    );

    // Change content
    rerender(
      <SyncHandler
        fs={fs}
        filePath={filePath}
        localContent="changed"
        state={state}
        tabState={tabState}
      />,
    );

    // Should not have saved yet
    expect(handleMock.createWritable).not.toHaveBeenCalled();

    // Fast forward time
    vi.advanceTimersByTime(1000);

    // Wait for async operations
    await vi.runAllTimersAsync();

    expect(handleMock.createWritable).toHaveBeenCalled();
    expect(writableMock.write).toHaveBeenCalledWith('changed');
    expect(writableMock.close).toHaveBeenCalled();
    expect(state).toHaveBeenCalled(); // Should update lastSaved
  });

  it('does not save if mode is not local', () => {
    fs.mode = 'remote';
    render(
      <SyncHandler
        fs={fs}
        filePath={filePath}
        localContent="changed"
        state={state}
        tabState={tabState}
      />,
    );

    vi.advanceTimersByTime(1000);
    expect(handleMock.createWritable).not.toHaveBeenCalled();
  });

  it('does not save if content has not changed', () => {
    render(
      <SyncHandler
        fs={fs}
        filePath={filePath}
        localContent="initial"
        state={state}
        tabState={tabState}
      />,
    );

    vi.advanceTimersByTime(1000);
    expect(handleMock.createWritable).not.toHaveBeenCalled();
  });

  it('flushes changes on beforeunload', async () => {
    state.fileContents[filePath] = 'initial';
    render(
      <SyncHandler
        fs={fs}
        filePath={filePath}
        localContent="unsaved changes"
        state={state}
        tabState={tabState}
      />,
    );

    // Trigger beforeunload
    fireEvent(window, new Event('beforeunload'));

    await vi.waitFor(() => {
      expect(handleMock.createWritable).toHaveBeenCalled();
    });
    expect(writableMock.write).toHaveBeenCalledWith('unsaved changes');
  });
});

// Helper for firing events manually since SyncHandler uses window.addEventListener
function fireEvent(element, event) {
  element.dispatchEvent(event);
}
