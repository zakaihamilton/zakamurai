import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import usePromptHistory from './PromptHistory';

vi.mock('@/components/Storage/Settings', () => ({
  __esModule: true,
  default: {
    addPromptHistory: vi.fn(),
    getPromptHistory: vi.fn().mockReturnValue(['first message', 'second message']),
  },
}));

describe('usePromptHistory', () => {
  it('returns handler functions', () => {
    const mockPromptUiState = vi.fn();
    const { result } = renderHook(() =>
      usePromptHistory('current val', -1, 'draft val', mockPromptUiState),
    );

    expect(result.current.handleArrowUp).toBeTypeOf('function');
    expect(result.current.handleArrowDown).toBeTypeOf('function');
    expect(result.current.addToHistory).toBeTypeOf('function');
  });

  it('handles arrow key transitions', () => {
    const mockPromptUiState = vi.fn();
    const { result } = renderHook(() =>
      usePromptHistory('current val', -1, 'draft val', mockPromptUiState),
    );

    act(() => {
      result.current.handleArrowUp();
    });

    expect(mockPromptUiState).toHaveBeenCalled();
  });
});
