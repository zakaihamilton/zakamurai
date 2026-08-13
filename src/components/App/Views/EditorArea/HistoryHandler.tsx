import type { CursorPosition } from '@/types/domain-types';
import { useEffect, useRef } from 'react';
import type { HistoryHandlerProps } from './types';

export default function HistoryHandler({ filePath, localContent, state }: HistoryHandlerProps) {
  const lastHistoryContent = useRef(localContent);
  const lastHistoryCursor = useRef<CursorPosition>(
    state.cursorPos?.[filePath] || { line: 1, col: 1, index: 0 },
  );

  const lastFilePath = useRef(filePath);

  if (filePath !== lastFilePath.current) {
    const globalContent = state.fileContents?.[filePath] || '';
    const snapshotCursor = state.cursorPos?.[filePath] || { line: 1, col: 1, index: 0 };
    lastHistoryContent.current = globalContent;
    lastHistoryCursor.current = snapshotCursor;
    lastFilePath.current = filePath;
  }

  useEffect(() => {
    const currentCursor = state.cursorPos?.[filePath];
    if (currentCursor) {
      if (localContent === lastHistoryContent.current) {
        lastHistoryCursor.current = currentCursor;

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

  useEffect(() => {
    const initialFilePath = filePath;
    const initialContent = localContent;

    const timer = setTimeout(() => {
      if (localContent !== state.fileContents?.[filePath]) return;

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

          const past = [...(hist.past || [])];
          past.push({
            content: lastHistoryContent.current,
            cursor: lastHistoryCursor.current,
          });
          if (past.length > 30) past.shift();
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
