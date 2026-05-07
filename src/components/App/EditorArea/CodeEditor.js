import React from 'react';
import styles from './EditorArea.module.css';

export default function CodeEditor({ localContent, handleChange, highlightedCode, readOnly }) {
  return (
    <div className={styles.editorWrapper}>
      <textarea
        value={localContent}
        onChange={readOnly ? undefined : handleChange}
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
