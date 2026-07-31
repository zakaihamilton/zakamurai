import { EditorState } from '@/components/App/Views/EditorArea';
import Settings from '@/components/Storage/Settings';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { skipEditorBufferFlushOnce, useContentSaver } from './ContentSaver';

vi.mock('@/components/App/Views/EditorArea', () => {
  return {
    EditorState: {
      usePassiveState: vi.fn(),
    },
  };
});

vi.mock('@/components/Storage/Settings', () => {
  return {
    default: {
      flushEditorBuffersSync: vi.fn(),
      setFileContents: vi.fn(),
      setPendingDiffs: vi.fn(),
    },
  };
});

describe('useContentSaver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not save on a timer (SettingsSync owns debounced persistence)', () => {
    vi.useFakeTimers();
    const mockState = {
      fileContents: { 'test.js': 'console.log("hello");' },
      pendingDiffs: {
        'test.js': {
          originalContent: 'old',
          diffs: [],
        },
      },
    };
    vi.mocked(EditorState.usePassiveState).mockReturnValue(mockState as never);

    renderHook(() => useContentSaver());

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(Settings.flushEditorBuffersSync).not.toHaveBeenCalled();
    expect(Settings.setFileContents).not.toHaveBeenCalled();
    expect(Settings.setPendingDiffs).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('flushes synchronously on beforeunload', () => {
    const mockState = {
      fileContents: { 'test.js': 'console.log("unload");' },
      pendingDiffs: {
        'test.js': {
          originalContent: 'old',
          diffs: [],
        },
        'missing.js': {
          originalContent: 'gone',
          diffs: [],
        },
        'skip.js': {
          originalContent: 1,
          diffs: 'nope',
        },
      },
    };
    vi.mocked(EditorState.usePassiveState).mockReturnValue(mockState as never);

    renderHook(() => useContentSaver());

    const event = new Event('beforeunload');
    act(() => {
      window.dispatchEvent(event);
    });

    expect(Settings.flushEditorBuffersSync).toHaveBeenCalledWith(mockState.fileContents, {
      'test.js': {
        originalContent: 'old',
        diffs: [],
        modifiedContent: 'console.log("unload");',
      },
      'missing.js': {
        originalContent: 'gone',
        diffs: [],
        modifiedContent: '',
      },
    });
  });

  it('skips one unload flush during an intentional project reset', () => {
    vi.mocked(EditorState.usePassiveState).mockReturnValue({
      fileContents: { 'test.js': 'old project' },
      pendingDiffs: {},
    } as never);
    renderHook(() => useContentSaver());
    skipEditorBufferFlushOnce();

    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });

    expect(Settings.flushEditorBuffersSync).not.toHaveBeenCalled();
  });
});
