import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import usePromptHistory from './PromptHistory';
import { PromptState } from './PromptState';

vi.mock('./PromptState', () => ({
  PromptState: {
    usePassiveState: vi.fn(),
  },
}));

describe('usePromptHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    PromptState.usePassiveState.mockReturnValue(
      Object.assign(vi.fn(), {
        promptHistory: ['first message', 'second message'],
      }),
    );
  });

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
