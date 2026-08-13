import { PromptState } from '@/components/App/Panes/Prompt/PromptState';
import type { PromptUiStateShape } from '@/types/domain-types';
import { useCallback } from 'react';
import type { StateStore } from 'triactor';

export default function usePromptHistory(
  val: string,
  historyIndex: number,
  draftVal: string,
  promptUiState: StateStore<PromptUiStateShape>,
) {
  const promptState = PromptState.usePassiveState();

  const handleArrowUp = useCallback(() => {
    const history = promptState?.promptHistory || [];
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      promptUiState((draft) => {
        if (historyIndex === -1) {
          draft.draftVal = val;
        }
        draft.historyIndex = newIndex;
        draft.val = history[newIndex];
      });
    }
  }, [val, historyIndex, promptUiState, promptState]);

  const handleArrowDown = useCallback(() => {
    const history = promptState?.promptHistory || [];
    if (historyIndex > -1) {
      const newIndex = historyIndex - 1;
      promptUiState((draft) => {
        draft.historyIndex = newIndex;
        draft.val = newIndex === -1 ? draftVal : history[newIndex];
      });
    }
  }, [historyIndex, draftVal, promptUiState, promptState]);

  const addToHistory = useCallback(
    (userMsg: string) => {
      if (!userMsg || !userMsg.trim()) {
        promptUiState((draft) => {
          draft.val = '';
          draft.historyIndex = -1;
          draft.draftVal = '';
        });
        return;
      }
      const trimmed = userMsg.trim();
      promptState?.((draft) => {
        const history = draft.promptHistory || [];
        draft.promptHistory = [trimmed, ...history.filter((p) => p !== trimmed)].slice(0, 50);
      });
      promptUiState((draft) => {
        draft.val = '';
        draft.historyIndex = -1;
        draft.draftVal = '';
      });
    },
    [promptUiState, promptState],
  );

  return {
    handleArrowUp,
    handleArrowDown,
    addToHistory,
  };
}
