import { useMemo } from 'react';
import { highlightCode } from './highlighter';

export default function useHighlightLoader({
  showSideBySide,
  hasDiff,
  localContent,
  editorContent,
  filePath,
  state,
  showFind,
  findQuery,
  matchIndex,
  suggestion,
  cursorPos,
  navigationLinksEnabled,
  diffData,
}) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: state is intentionally omitted to prevent re-highlighting on every state change
  const highlightedCode = useMemo(() => {
    return highlightCode(
      showSideBySide && hasDiff ? localContent : editorContent,
      filePath,
      state,
      undefined,
      showFind,
      findQuery,
      matchIndex,
      suggestion,
      cursorPos,
      navigationLinksEnabled,
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
    navigationLinksEnabled,
    navigationLinksEnabled ? state.fileContents : null,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: state is intentionally omitted to prevent re-highlighting on every state change
  const originalHighlightedCode = useMemo(() => {
    if (!showSideBySide || !diffData) return '';
    return highlightCode(
      diffData.originalContent,
      filePath,
      state,
      undefined,
      showFind,
      findQuery,
      matchIndex,
      undefined,
      state.cursorPos?.[filePath],
      navigationLinksEnabled,
      true,
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
    navigationLinksEnabled,
    navigationLinksEnabled ? state.fileContents : null,
  ]);

  return {
    highlightedCode,
    originalHighlightedCode,
  };
}
