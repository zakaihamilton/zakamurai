import { useEffect, useState } from 'react';
import { highlightCodeAsync, highlightCodeSync } from './highlightClient';
import type { HighlightEditorState, HighlightLoaderProps } from './types';

const toHighlightState = (state: HighlightLoaderProps['state']): HighlightEditorState => ({
  pendingDiffs: state.pendingDiffs as HighlightEditorState['pendingDiffs'],
  selectedLines: state.selectedLines,
  fileContents: state.fileContents,
  cursorPos: state.cursorPos,
});

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
}: HighlightLoaderProps) {
  const primaryCode = showSideBySide && hasDiff ? localContent : editorContent;

  const highlightState = toHighlightState(state);

  const [highlightedCode, setHighlightedCode] = useState(() =>
    highlightCodeSync(
      primaryCode,
      filePath,
      highlightState,
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
    const request = highlightCodeAsync(
      primaryCode,
      filePath,
      highlightState,
      undefined,
      showFind,
      findQuery,
      matchIndex,
      suggestion,
      cursorPos,
      navigationLinksEnabled,
    );
    void request
      .then((html) => {
        if (!cancelled && html != null) setHighlightedCode(html);
      })
      .catch(() => {
        if (cancelled) return;
        setHighlightedCode(
          highlightCodeSync(
            primaryCode,
            filePath,
            highlightState,
            undefined,
            showFind,
            findQuery,
            matchIndex,
            suggestion,
            cursorPos,
            navigationLinksEnabled,
          ),
        );
      });
    return () => {
      cancelled = true;
      request.cancel?.();
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
    const request = highlightCodeAsync(
      diffData.originalContent,
      filePath,
      highlightState,
      undefined,
      showFind,
      findQuery,
      matchIndex,
      undefined,
      state.cursorPos?.[filePath],
      navigationLinksEnabled,
      true,
    );
    void request
      .then((html) => {
        if (!cancelled && html != null) setOriginalHighlightedCode(html);
      })
      .catch(() => {
        if (cancelled) return;
        setOriginalHighlightedCode(
          highlightCodeSync(
            diffData.originalContent,
            filePath,
            highlightState,
            undefined,
            showFind,
            findQuery,
            matchIndex,
            undefined,
            state.cursorPos?.[filePath],
            navigationLinksEnabled,
            true,
          ),
        );
      });
    return () => {
      cancelled = true;
      request.cancel?.();
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
