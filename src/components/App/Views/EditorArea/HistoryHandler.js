import React, { useEffect, useRef } from 'react';

export default function HistoryHandler({ filePath, localContent, state }) {
  const lastHistoryContent = useRef(localContent);
  const lastHistoryCursor = useRef(state.cursorPos?.[filePath] || { line: 1, col: 1, index: 0 });

  const lastFilePath = useRef(filePath);

  if (filePath !== lastFilePath.current) {
    const globalContent = state.fileContents?.[filePath] || '';
    const snapshotCursor = state.cursorPos?.[filePath] || { line: 1, col: 1, index: 0 };
    lastHistoryContent.current = globalContent;
    lastHistoryCursor.current = snapshotCursor;
    lastFilePath.current = filePath;
  }

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
        const historyEntry = state.history?.[filePath];
        if (!historyEntry) return;
        if (
          historyEntry.lastSnapshotCursor?.index === currentCursor.index &&
          historyEntry.lastSnapshotCursor?.line === currentCursor.line &&
          historyEntry.lastSnapshotCursor?.col === currentCursor.col
        ) {
          return;
        }

        state((draft) => {
          if (draft.history?.[filePath]) {
            const history = { ...draft.history };
            const hist = { ...history[filePath] };
            hist.lastSnapshotCursor = { ...currentCursor };
            history[filePath] = hist;
            draft.history = history;
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
      if (localContent !== state.fileContents?.[filePath]) return;

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
