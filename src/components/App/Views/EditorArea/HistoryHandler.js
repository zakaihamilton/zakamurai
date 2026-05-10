import React, { useEffect, useRef } from 'react';

export default function HistoryHandler({ filePath, localContent, setLocalContent, state }) {
  const lastHistoryContent = useRef(localContent);
  const lastHistoryCursor = useRef(state.cursorPos?.[filePath] || { line: 1, col: 1, index: 0 });

  const lastFilePath = useRef(filePath);

  // Sync local state if the active file tab changes or content is updated externally
  // biome-ignore lint/correctness/useExhaustiveDependencies: state is a stable dispatcher in this context
  useEffect(() => {
    const globalContent = state.fileContents?.[filePath] || '';
    const fileSwitched = filePath !== lastFilePath.current;

    if (globalContent !== localContent || fileSwitched) {
      setLocalContent(globalContent);
      lastHistoryContent.current = globalContent;
      lastHistoryCursor.current = state.cursorPos?.[filePath] || { line: 1, col: 1, index: 0 };

      state((draft) => {
        if (!draft.history) draft.history = {};
        if (!draft.history[filePath]) {
          draft.history[filePath] = { past: [], future: [] };
        }
        draft.history[filePath].lastSnapshotContent = globalContent;
        draft.history[filePath].lastSnapshotCursor = state.cursorPos?.[filePath] || {
          line: 1,
          col: 1,
          index: 0,
        };
      });
    }

    if (fileSwitched) {
      lastFilePath.current = filePath;
      // Also clear history triggered redo stack if needed? No, state manages it.
    }
  }, [filePath, state.fileContents?.[filePath], localContent, setLocalContent, state.cursorPos]);

  // Continuously track the current cursor for the next snapshot
  useEffect(() => {
    // Only update the "pre-change" cursor if we haven't started a change yet
    if (localContent === lastHistoryContent.current) {
      const currentCursor = state.cursorPos?.[filePath];
      if (currentCursor) {
        lastHistoryCursor.current = currentCursor;
      }
    }
  }, [state.cursorPos?.[filePath], localContent, filePath]);

  // History tracking (debounced snapshots)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localContent !== lastHistoryContent.current) {
        state((draft) => {
          if (!draft.history) draft.history = {};
          if (!draft.history[filePath]) {
            draft.history[filePath] = { past: [], future: [] };
          }
          const hist = draft.history[filePath];

          // Push current state to past before updating lastHistoryContent
          // We use a capture of the cursor from BEFORE the content changed
          hist.past.push({
            content: lastHistoryContent.current,
            cursor: lastHistoryCursor.current,
          });
          if (hist.past.length > 100) hist.past.shift();

          hist.lastSnapshotContent = localContent;
          hist.lastSnapshotCursor = lastHistoryCursor.current;
          lastHistoryContent.current = localContent;
        });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localContent, filePath, state]);

  return null;
}
