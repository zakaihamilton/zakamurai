import React from 'react';
import styles from './EditorArea.module.css';

export default function Gutter({ linesArr, selectedLines = [], toggleLine }) {
  return (
    <div className={styles.gutter}>
      <div className={styles.gutterContent}>
        {linesArr.map((line) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: gutter lines are clickable for selection
          <div
            key={line}
            onClick={(e) => {
              e.stopPropagation();
              if (toggleLine) toggleLine(line);
            }}
            className={`${styles.gutterLine} ${
              selectedLines.some((l) => Number(l) === Number(line)) ? styles.selectedGutterLine : ''
            }`}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
