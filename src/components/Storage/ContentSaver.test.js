import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useContentSaver } from './ContentSaver';
import { EditorState } from '@/components/App/Views/EditorArea';
import Settings from '@/components/Storage/Settings';

vi.mock('@/components/App/Views/EditorArea', () => {
  return {
    EditorState: {
      useState: vi.fn(),
    },
  };
});

vi.mock('@/components/Storage/Settings', () => {
  return {
    default: {
      setFileContents: vi.fn(),
      setPendingDiffs: vi.fn(),
    },
  };
});

describe('useContentSaver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves file contents and pending diffs on timer', () => {
    const mockState = {
      fileContents: { 'test.js': 'console.log("hello");' },
      pendingDiffs: {
        'test.js': {
          originalContent: 'old',
          diffs: [],
        },
      },
    };
    EditorState.useState.mockReturnValue(mockState);

    renderHook(() => useContentSaver());

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(Settings.setFileContents).toHaveBeenCalledWith(mockState.fileContents);
    expect(Settings.setPendingDiffs).toHaveBeenCalledWith({
      'test.js': {
        originalContent: 'old',
        diffs: [],
        modifiedContent: 'console.log("hello");',
      },
    });
  });

  it('saves on beforeunload event', () => {
    const mockState = {
      fileContents: { 'test.js': 'console.log("unload");' },
      pendingDiffs: {},
    };
    EditorState.useState.mockReturnValue(mockState);

    renderHook(() => useContentSaver());

    const event = new Event('beforeunload');
    act(() => {
      window.dispatchEvent(event);
    });

    expect(Settings.setFileContents).toHaveBeenCalledWith(mockState.fileContents);
    expect(Settings.setPendingDiffs).toHaveBeenCalledWith({});
  });
});
