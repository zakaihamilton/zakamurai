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
  let promptStateUpdater;

  beforeEach(() => {
    vi.clearAllMocks();
    promptStateUpdater = vi.fn((producer) => {
      const draft = { promptHistory: ['first message', 'second message'] };
      producer(draft);
      promptStateUpdater.lastDraft = draft;
    });
    PromptState.usePassiveState.mockReturnValue(
      Object.assign(promptStateUpdater, {
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
    const { result, rerender } = renderHook(
      ({ val, historyIndex, draftVal }) =>
        usePromptHistory(val, historyIndex, draftVal, mockPromptUiState),
      { initialProps: { val: 'current val', historyIndex: -1, draftVal: 'draft val' } },
    );

    act(() => {
      result.current.handleArrowUp();
    });
    expect(mockPromptUiState).toHaveBeenCalled();
    const upDraft = {};
    mockPromptUiState.mock.calls.at(-1)[0](upDraft);
    expect(upDraft).toEqual({
      draftVal: 'current val',
      historyIndex: 0,
      val: 'first message',
    });

    mockPromptUiState.mockClear();
    rerender({ val: 'first message', historyIndex: 0, draftVal: 'draft val' });
    act(() => {
      result.current.handleArrowDown();
    });
    const downDraft = {};
    mockPromptUiState.mock.calls.at(-1)[0](downDraft);
    expect(downDraft).toEqual({
      historyIndex: -1,
      val: 'draft val',
    });
  });

  it('addToHistory ignores blank prompts and clears the draft', () => {
    const mockPromptUiState = vi.fn();
    const { result } = renderHook(() =>
      usePromptHistory('current val', 0, 'draft val', mockPromptUiState),
    );

    act(() => {
      result.current.addToHistory('   ');
    });

    expect(promptStateUpdater).not.toHaveBeenCalled();
    const draft = {};
    mockPromptUiState.mock.calls.at(-1)[0](draft);
    expect(draft).toEqual({ val: '', historyIndex: -1, draftVal: '' });
  });

  it('addToHistory prepends unique prompts', () => {
    const mockPromptUiState = vi.fn();
    const { result } = renderHook(() =>
      usePromptHistory('current val', -1, 'draft val', mockPromptUiState),
    );

    act(() => {
      result.current.addToHistory('  second message  ');
    });

    expect(promptStateUpdater.lastDraft.promptHistory[0]).toBe('second message');
    expect(promptStateUpdater.lastDraft.promptHistory).toEqual(['second message', 'first message']);
  });
});
