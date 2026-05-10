import { useCallback, useEffect } from 'react';

export default function DiffHandler({
  filePath,
  localContent,
  setLocalContent,
  state,
  fs,
  onStateChange,
}) {
  const handleApprove = useCallback(async () => {
    state((draft) => {
      if (draft.pendingDiffs) {
        const nextDiffs = { ...draft.pendingDiffs };
        delete nextDiffs[filePath];
        draft.pendingDiffs = nextDiffs;
      }
    });

    try {
      if (fs?.rootHandle && fs?.writeFileAtPath) {
        await fs.writeFileAtPath(filePath, localContent);
        state((draft) => {
          draft.lastSaved = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
        });
      }
    } catch (err) {
      console.error('Failed to save to FS on approve:', err);
    }
  }, [filePath, localContent, state, fs]);

  const handleUndo = useCallback(async () => {
    const diff = state.pendingDiffs?.[filePath];
    if (diff) {
      const prevContent = diff.originalContent;
      state((draft) => {
        draft.fileContents = { ...draft.fileContents, [filePath]: prevContent };
        if (draft.pendingDiffs) {
          const nextDiffs = { ...draft.pendingDiffs };
          delete nextDiffs[filePath];
          draft.pendingDiffs = nextDiffs;
        }
      });
      setLocalContent(prevContent);

      try {
        if (fs?.rootHandle && fs?.writeFileAtPath) {
          await fs.writeFileAtPath(filePath, prevContent);
        }
      } catch (err) {
        console.error('Failed to undo in FS:', err);
      }
    }
  }, [filePath, state, fs, setLocalContent]);

  const toggleLine = useCallback(
    (line) => {
      const lineNum = Number(line);
      state((draft) => {
        if (!draft.selectedLines) draft.selectedLines = {};
        const current = draft.selectedLines[filePath] || [];
        const exists = current.some((l) => Number(l) === lineNum);

        if (exists) {
          draft.selectedLines[filePath] = current.filter((l) => Number(l) !== lineNum);
        } else {
          draft.selectedLines[filePath] = [...current, lineNum];
        }
        draft.selectedLines = { ...draft.selectedLines };
      });
    },
    [filePath, state],
  );

  const handleCursorUpdate = useCallback(
    (pos) => {
      state((draft) => {
        draft.cursorPos = {
          ...draft.cursorPos,
          [filePath]: pos,
        };
      });
    },
    [filePath, state],
  );

  // Provide methods to parent
  useEffect(() => {
    onStateChange({
      handleApprove,
      handleUndo,
      toggleLine,
      handleCursorUpdate,
    });
  }, [handleApprove, handleUndo, toggleLine, handleCursorUpdate, onStateChange]);

  return null;
}
