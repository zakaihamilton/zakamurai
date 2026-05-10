import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { Icons } from '@/components/Core/Base/Icons';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import React from 'react';
import styles from './StatusBar.module.css';

export default function StatusBar() {
  const { theme, projectName, fs } = AppState.useState();
  const editorState = EditorState.useState();
  const tabState = TabState.useState();
  const { activeTabId, openTabs = [] } = tabState;
  const activeTab = openTabs.find((t) => t.id === activeTabId);
  const { cursorPos = {} } = editorState;

  const currentCursor = cursorPos[activeTabId] || { line: 1, col: 1 };
  const { line, col } = currentCursor;

  const encoding = 'UTF-8';
  const language =
    activeTab?.type === 'logs'
      ? 'System Log'
      : activeTab?.type === 'preview'
        ? 'Preview'
        : activeTabId?.endsWith('.js') || activeTabId?.endsWith('.jsx')
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
        <Tooltip content={`Project: ${projectName}`} className={styles.tooltipWrapper}>
          <div className={styles.item}>
            <Icons.Folder size={14} />
            <span>{projectName}</span>
          </div>
        </Tooltip>
        <Tooltip
          content={`FileSystem Mode: ${fs.mode === 'local' ? 'Local' : 'Virtual'}`}
          className={styles.tooltipWrapper}
        >
          <div className={styles.item}>
            <Icons.Globe size={14} />
            <span>{fs.mode === 'local' ? 'Local' : 'Virtual'}</span>
          </div>
        </Tooltip>
      </div>

      <div className={styles.right}>
        {activeTab && (
          <>
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
          </>
        )}
      </div>
    </footer>
  );
}
