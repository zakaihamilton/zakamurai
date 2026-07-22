import { EditorState } from '@/components/App/Views/EditorArea';
import Settings from '@/components/Storage/Settings';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useContentSaver } from './ContentSaver';

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
    EditorState.useState.mockReturnValue(mockState);

    renderHook(() => useContentSaver());

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(Settings.setFileContents).not.toHaveBeenCalled();
    expect(Settings.setPendingDiffs).not.toHaveBeenCalled();
    vi.useRealTimers();
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
