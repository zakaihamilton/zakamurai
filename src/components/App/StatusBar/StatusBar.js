import React from 'react';
import { AppState } from '../App';
import { EditorState } from '../EditorArea';
import { Icons } from '../Icons';
import styles from './StatusBar.module.css';
import { TabState } from '../TabBar';

export default function StatusBar() {
  const { theme, projectName, fs } = AppState.useState();
  const editorState = EditorState.useState();
  const tabState = TabState.useState();
  const { activeTabId } = tabState;
  const { cursorPos = {} } = editorState;

  const currentCursor = cursorPos[activeTabId] || { line: 1, col: 1 };
  const { line, col } = currentCursor;

  const encoding = 'UTF-8';
  const language =
    activeTabId?.endsWith('.js') || activeTabId?.endsWith('.jsx')
      ? 'JavaScript'
      : activeTabId?.endsWith('.ts') || activeTabId?.endsWith('.tsx')
        ? 'TypeScript'
        : activeTabId?.endsWith('.css')
          ? 'CSS'
          : activeTabId?.endsWith('.html')
            ? 'HTML'
            : activeTabId?.endsWith('.json')
              ? 'JSON'
              : activeTabId?.endsWith('.md')
                ? 'Markdown'
                : 'Plain Text';

  return (
    <footer className={`${styles.statusBar} ${theme === 'light' ? styles.light : ''}`}>
      <div className={styles.left}>
        <div className={styles.item} title={`Project: ${projectName}`}>
          <Icons.Folder size={14} />
          <span>{projectName}</span>
        </div>
        <div className={styles.item} title={`FileSystem Mode: ${fs.mode || 'Virtual'}`}>
          <Icons.Globe size={14} />
          <span>{fs.mode === 'local' ? 'Local' : 'Virtual'}</span>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.item}>
          <span>
            Ln {line}, Col {col}
          </span>
        </div>
        <div className={styles.item}>
          <span>Spaces: 2</span>
        </div>
        <div className={styles.item}>
          <span>{encoding}</span>
        </div>
        <div className={styles.item}>
          <Icons.Bot size={14} />
          <span>{language}</span>
        </div>
      </div>
    </footer>
  );
}
