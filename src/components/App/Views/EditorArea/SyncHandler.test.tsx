import { createMockEditorState, createMockTabState } from '@/test-utils/editorMocks';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SyncHandler from './SyncHandler';

describe('SyncHandler', () => {
  const filePath = 'test.js';
  let fs: { mode: string };
  let state: ReturnType<typeof createMockEditorState>;
  let tabState: ReturnType<typeof createMockTabState>;
  let writableMock: { write: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  let handleMock: { createWritable: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    fs = { mode: 'local' };
    state = createMockEditorState({ fileContents: {}, pendingDiffs: {} });

    writableMock = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    handleMock = {
      createWritable: vi.fn().mockResolvedValue(writableMock),
    };

    tabState = createMockTabState({
      openTabs: [
        {
          id: filePath,
          type: 'file',
          label: filePath,
          fsHandle: handleMock as unknown as FileSystemFileHandle,
        },
      ],
    });
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

    rerender(
      <SyncHandler
        fs={fs}
        filePath={filePath}
        localContent="changed"
        state={state}
        tabState={tabState}
      />,
    );

    expect(handleMock.createWritable).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    await vi.runAllTimersAsync();

    expect(handleMock.createWritable).toHaveBeenCalled();
    expect(writableMock.write).toHaveBeenCalledWith('changed');
    expect(writableMock.close).toHaveBeenCalled();
    expect(state).toHaveBeenCalled();
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

    window.dispatchEvent(new Event('beforeunload'));

    await vi.waitFor(() => {
      expect(handleMock.createWritable).toHaveBeenCalled();
    });
    expect(writableMock.write).toHaveBeenCalledWith('unsaved changes');
  });
});
