import React, { useLayoutEffect, useRef, useCallback } from 'react';
import styles from './EditorArea.module.css';

import useEditorShortcuts from './EditorShortcuts';

const getCursorPosition = (content, index) => {
  let line = 1;
  let lineStart = 0;

  for (let cursor = 0; cursor < index; cursor++) {
    if (content.charCodeAt(cursor) === 10) {
      line++;
      lineStart = cursor + 1;
    }
  }

  return { line, col: index - lineStart + 1, index };
};

export default function CodeEditor({
  localContent,
  handleChange,
  highlightedCode,
  readOnly,
  onCursorUpdate,
  cursorPos,
  scrollContainerRef,
  suggestion,
  onAcceptSuggestion,
  onCancelSuggestion,
  filePath,
}) {
  const textareaRef = useRef(null);
  const lastReportedIndex = useRef(-1);
  const isLocalEdit = useRef(false);

  const handleSelectionChange = useCallback(
    (e) => {
      if (!onCursorUpdate) return;
      const textarea = e.target;
      const start = textarea.selectionStart;

      lastReportedIndex.current = start;
      onCursorUpdate(getCursorPosition(localContent, start));
    },
    [onCursorUpdate, localContent],
  );

  const localHandleChange = useCallback(
    (e) => {
      isLocalEdit.current = true;
      handleChange?.(e);
      handleSelectionChange(e);
    },
    [handleChange, handleSelectionChange],
  );

  const { handleKeyDown } = useEditorShortcuts({
    handleChange: localHandleChange,
    textareaRef,
    scrollContainerRef,
    suggestion,
    onAcceptSuggestion,
    onCancelSuggestion,
    filePath,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: localContent is required to catch browser cursor resets after sync
  useLayoutEffect(() => {
    if (textareaRef.current && cursorPos?.index !== undefined) {
      const textarea = textareaRef.current;
      const externalMove = cursorPos.index !== lastReportedIndex.current;
      const browserReset =
        (textarea.selectionStart !== cursorPos.index ||
          textarea.selectionEnd !== cursorPos.index) &&
        !isLocalEdit.current;

      if (externalMove || browserReset) {
        textarea.selectionStart = cursorPos.index;
        textarea.selectionEnd = cursorPos.index;
        lastReportedIndex.current = cursorPos.index;
      }
    }
    isLocalEdit.current = false;
  }, [cursorPos?.index, localContent]);

  return (
    <div className={styles.editorWrapper}>
      <textarea
        ref={textareaRef}
        value={localContent}
        onChange={readOnly ? undefined : localHandleChange}
        onKeyDown={readOnly ? undefined : handleKeyDown}
        onKeyUp={handleSelectionChange}
        onBlur={handleSelectionChange}
        onClick={handleSelectionChange}
        onSelect={handleSelectionChange}
        onFocus={handleSelectionChange}
        readOnly={readOnly}
        spellCheck="false"
        className={styles.textarea}
      />

      <pre
        aria-hidden="true"
        className={styles.pre}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: used for code syntax highlighting
        dangerouslySetInnerHTML={{
          __html: highlightedCode + (localContent.endsWith('\n') ? ' ' : ''),
        }}
      />
    </div>
  );
}
