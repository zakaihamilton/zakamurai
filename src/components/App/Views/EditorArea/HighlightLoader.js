import { useMemo } from 'react';
import { highlightCode } from './highlighter';

export default function useHighlightLoader({
  showSideBySide,
  hasDiff,
  localContent,
  editorContent,
  filePath,
  state,
  styles,
  showFind,
  findQuery,
  matchIndex,
  suggestion,
  cursorPos,
  isReadOnly,
  diffData,
}) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: state is intentionally omitted to prevent re-highlighting on every state change
  const highlightedCode = useMemo(() => {
    return highlightCode(
      showSideBySide && hasDiff ? localContent : editorContent,
      filePath,
      state,
      styles,
      showFind,
      findQuery,
      matchIndex,
      suggestion,
      cursorPos,
      isReadOnly,
    );
  }, [
    editorContent,
    hasDiff,
    localContent,
    showSideBySide,
    filePath,
    state.pendingDiffs?.[filePath],
    state.selectedLines?.[filePath],
    showFind,
    findQuery,
    matchIndex,
    suggestion,
    cursorPos,
    isReadOnly,
    isReadOnly ? state.fileContents : null,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: state is intentionally omitted to prevent re-highlighting on every state change
  const originalHighlightedCode = useMemo(() => {
    if (!showSideBySide || !diffData) return '';
    return highlightCode(
      diffData.originalContent,
      filePath,
      state,
      styles,
      showFind,
      findQuery,
      matchIndex,
      undefined,
      state.cursorPos?.[filePath],
      isReadOnly,
    );
  }, [
    showSideBySide,
    diffData,
    filePath,
    state.pendingDiffs?.[filePath],
    state.selectedLines?.[filePath],
    showFind,
    findQuery,
    matchIndex,
    state.cursorPos?.[filePath],
    isReadOnly,
    isReadOnly ? state.fileContents : null,
  ]);

  return {
    highlightedCode,
    originalHighlightedCode,
  };
}
