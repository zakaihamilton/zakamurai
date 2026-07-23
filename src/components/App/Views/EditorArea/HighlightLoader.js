import { useEffect, useState } from 'react';
import { highlightCodeAsync, highlightCodeSync } from './highlightClient';

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
  const primaryCode = showSideBySide && hasDiff ? localContent : editorContent;

  const [highlightedCode, setHighlightedCode] = useState(() =>
    highlightCodeSync(
      primaryCode,
      filePath,
      state,
      undefined,
      showFind,
      findQuery,
      matchIndex,
      suggestion,
      cursorPos,
      navigationLinksEnabled,
    ),
  );

  const [originalHighlightedCode, setOriginalHighlightedCode] = useState('');

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional narrow deps; avoid re-highlight on unrelated editor state churn
  useEffect(() => {
    let cancelled = false;
    void highlightCodeAsync(
      primaryCode,
      filePath,
      state,
      undefined,
      showFind,
      findQuery,
      matchIndex,
      suggestion,
      cursorPos,
      navigationLinksEnabled,
    ).then((html) => {
      if (!cancelled) setHighlightedCode(html);
    });
    return () => {
      cancelled = true;
    };
  }, [
    primaryCode,
    filePath,
    showFind,
    findQuery,
    matchIndex,
    suggestion,
    cursorPos,
    navigationLinksEnabled,
    state.pendingDiffs?.[filePath],
    state.selectedLines?.[filePath],
    navigationLinksEnabled ? state.fileContents : null,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional narrow deps for original pane
  useEffect(() => {
    if (!showSideBySide || !diffData) {
      setOriginalHighlightedCode('');
      return undefined;
    }
    let cancelled = false;
    void highlightCodeAsync(
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
    ).then((html) => {
      if (!cancelled) setOriginalHighlightedCode(html);
    });
    return () => {
      cancelled = true;
    };
  }, [
    showSideBySide,
    diffData,
    filePath,
    showFind,
    findQuery,
    matchIndex,
    navigationLinksEnabled,
    state.pendingDiffs?.[filePath],
    state.selectedLines?.[filePath],
    state.cursorPos?.[filePath],
    navigationLinksEnabled ? state.fileContents : null,
  ]);

  return {
    highlightedCode,
    originalHighlightedCode,
  };
}
