import React from 'react';
import styles from './EditorArea.module.css';

export default function CodeEditor({
  localContent,
  handleChange,
  highlightedCode,
  readOnly,
  onCursorUpdate,
}) {
  const handleSelectionChange = (e) => {
    if (!onCursorUpdate) return;
    const textarea = e.target;
    const start = textarea.selectionStart;
    const textBefore = localContent.substring(0, start);
    const lines = textBefore.split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    onCursorUpdate({ line, col });
  };

  return (
    <div className={styles.editorWrapper}>
      <textarea
        value={localContent}
        onChange={readOnly ? undefined : handleChange}
        onKeyUp={handleSelectionChange}
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
