import React, { useEffect, useRef } from 'react';

export default function HistoryHandler({ filePath, localContent, setLocalContent, state }) {
  const lastHistoryContent = useRef(localContent);
  const lastHistoryCursor = useRef(state.cursorPos?.[filePath] || { line: 1, col: 1, index: 0 });

  const lastFilePath = useRef(filePath);

  // Sync local state if the active file tab changes or content is updated externally
  useEffect(() => {
    const globalContent = state.fileContents?.[filePath] || '';
    const fileSwitched = filePath !== lastFilePath.current;

    if (globalContent !== localContent || fileSwitched) {
      setLocalContent(globalContent);
      lastHistoryContent.current = globalContent;
      lastHistoryCursor.current = state.cursorPos?.[filePath] || { line: 1, col: 1, index: 0 };

      state((draft) => {
        const history = { ...(draft.history || {}) };
        if (!history[filePath]) {
          history[filePath] = { past: [], future: [] };
        } else {
          history[filePath] = { ...history[filePath] };
        }
        history[filePath].lastSnapshotContent = globalContent;
        history[filePath].lastSnapshotCursor = state.cursorPos?.[filePath] || {
          line: 1,
          col: 1,
          index: 0,
        };
        draft.history = history;
      });
    }

    if (fileSwitched) {
      lastFilePath.current = filePath;
      // Also clear history triggered redo stack if needed? No, state manages it.
    }
  }, [
    filePath,
    state.fileContents?.[filePath],
    localContent,
    setLocalContent,
    state.cursorPos,
    state,
  ]);

  // Continuously track the current cursor for the next snapshot
  useEffect(() => {
    const currentCursor = state.cursorPos?.[filePath];
    if (currentCursor) {
      // If we are currently at the same content as the last snapshot,
      // then this cursor position is a good candidate for the "pre-change" cursor.
      if (localContent === lastHistoryContent.current) {
        lastHistoryCursor.current = currentCursor;

        // Also update the global lastSnapshotCursor so undo knows where to return to
        // if an undo is performed before the next snapshot is taken.
        state((draft) => {
          if (draft.history?.[filePath]) {
            const history = { ...draft.history };
            const hist = { ...history[filePath] };
            if (!hist.lastSnapshotCursor || hist.lastSnapshotCursor.index !== currentCursor.index) {
              hist.lastSnapshotCursor = { ...currentCursor };
              history[filePath] = hist;
              draft.history = history;
            }
          }
        });
      }
    }
  }, [state.cursorPos?.[filePath], localContent, filePath, state]);

  // History tracking (debounced snapshots)
  useEffect(() => {
    const initialFilePath = filePath;
    const initialContent = localContent;

    const timer = setTimeout(() => {
      // Ensure we are still on the same file and the content is still what we intended to snapshot
      if (
        filePath === initialFilePath &&
        localContent === initialContent &&
        localContent !== lastHistoryContent.current
      ) {
        state((draft) => {
          const history = { ...(draft.history || {}) };
          if (!history[filePath]) {
            history[filePath] = { past: [], future: [] };
          } else {
            history[filePath] = { ...history[filePath] };
          }
          const hist = history[filePath];

          // Push current state to past before updating lastHistoryContent
          // We use a capture of the cursor from BEFORE the content changed
          const past = [...(hist.past || [])];
          past.push({
            content: lastHistoryContent.current,
            cursor: lastHistoryCursor.current,
          });
          if (past.length > 100) past.shift();
          hist.past = past;

          hist.lastSnapshotContent = localContent;
          hist.lastSnapshotCursor = state.cursorPos?.[filePath] || lastHistoryCursor.current;

          draft.history = history;
          lastHistoryContent.current = localContent;
        });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localContent, filePath, state]);

  return null;
}
