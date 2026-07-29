import { makePromptState, makePromptUiState } from '@/test-utils/stateMocks';
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
  let promptState: ReturnType<typeof makePromptState> & { lastDraft?: { promptHistory: string[] } };

  beforeEach(() => {
    vi.clearAllMocks();
    promptState = makePromptState({ promptHistory: ['first message', 'second message'] });
    const original = promptState.getMockImplementation();
    promptState.mockImplementation((producer) => {
      const draft = { promptHistory: ['first message', 'second message'] };
      producer(draft);
      promptState.lastDraft = draft;
      return original?.(producer);
    });
    vi.mocked(PromptState.usePassiveState).mockReturnValue(promptState);
  });

  it('returns handler functions', () => {
    const promptUiState = makePromptUiState();
    const { result } = renderHook(() =>
      usePromptHistory('current val', -1, 'draft val', promptUiState),
    );

    expect(result.current.handleArrowUp).toBeTypeOf('function');
    expect(result.current.handleArrowDown).toBeTypeOf('function');
    expect(result.current.addToHistory).toBeTypeOf('function');
  });

  it('handles arrow key transitions', () => {
    const promptUiState = makePromptUiState();
    const { result, rerender } = renderHook(
      ({ val, historyIndex, draftVal }) =>
        usePromptHistory(val, historyIndex, draftVal, promptUiState),
      { initialProps: { val: 'current val', historyIndex: -1, draftVal: 'draft val' } },
    );

    act(() => {
      result.current.handleArrowUp();
    });
    expect(promptUiState).toHaveBeenCalled();
    const upDraft: Record<string, unknown> = {};
    promptUiState.mock.calls.at(-1)?.[0](upDraft);
    expect(upDraft).toEqual({
      draftVal: 'current val',
      historyIndex: 0,
      val: 'first message',
    });

    promptUiState.mockClear();
    rerender({ val: 'first message', historyIndex: 0, draftVal: 'draft val' });
    act(() => {
      result.current.handleArrowDown();
    });
    const downDraft: Record<string, unknown> = {};
    promptUiState.mock.calls.at(-1)?.[0](downDraft);
    expect(downDraft).toEqual({
      historyIndex: -1,
      val: 'draft val',
    });
  });

  it('addToHistory ignores blank prompts and clears the draft', () => {
    const promptUiState = makePromptUiState();
    const { result } = renderHook(() =>
      usePromptHistory('current val', 0, 'draft val', promptUiState),
    );

    act(() => {
      result.current.addToHistory('   ');
    });

    expect(promptState).not.toHaveBeenCalled();
    const draft: Record<string, unknown> = {};
    promptUiState.mock.calls.at(-1)?.[0](draft);
    expect(draft).toEqual({ val: '', historyIndex: -1, draftVal: '' });
  });

  it('addToHistory prepends unique prompts', () => {
    const promptUiState = makePromptUiState();
    const { result } = renderHook(() =>
      usePromptHistory('current val', -1, 'draft val', promptUiState),
    );

    act(() => {
      result.current.addToHistory('  second message  ');
    });

    expect(promptState.lastDraft?.promptHistory[0]).toBe('second message');
    expect(promptState.lastDraft?.promptHistory).toEqual(['second message', 'first message']);
  });
});
