import Settings from '@/components/Storage/Settings';
import { useCallback } from 'react';

export default function usePromptHistory(val, historyIndex, draftVal, promptUiState) {
  const handleArrowUp = useCallback(() => {
    const history = Settings.getPromptHistory();
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
  }, [val, historyIndex, promptUiState]);

  const handleArrowDown = useCallback(() => {
    const history = Settings.getPromptHistory();
    if (historyIndex > -1) {
      const newIndex = historyIndex - 1;
      promptUiState((draft) => {
        draft.historyIndex = newIndex;
        draft.val = newIndex === -1 ? draftVal : history[newIndex];
      });
    }
  }, [historyIndex, draftVal, promptUiState]);

  const addToHistory = useCallback(
    (userMsg) => {
      Settings.addPromptHistory(userMsg);
      promptUiState((draft) => {
        draft.val = '';
        draft.historyIndex = -1;
        draft.draftVal = '';
      });
    },
    [promptUiState],
  );

  return {
    handleArrowUp,
    handleArrowDown,
    addToHistory,
  };
}
