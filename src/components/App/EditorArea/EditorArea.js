import React, { useState, useEffect, useRef } from 'react';
import { createState } from '../../Core/Base/State';
import { AppState } from '../App';
import { Icons } from '../Icons';
import { TabState } from '../TabBar';
import styles from './EditorArea.module.css';

export const EditorState = createState('EditorState');

export default function EditorArea({ file }) {
  const appState = AppState.useState();
  const tabState = TabState.useState();
  const { fs } = appState;
  const state = EditorState.useState();
  const filePath = file?.path?.join('/') || file?.name;
  const saveTimeoutRef = useRef(null);

  // Use local state for immediate synchronous updates to prevent cursor jumping,
  // falling back to the global state engine context
  const [localContent, setLocalContent] = useState(() => state.fileContents?.[filePath] || '');

  // Generate line numbers array based on line breaks
  const linesCount = localContent.split('\n').length;
  const linesArr = Array.from({ length: linesCount }, (_, i) => i + 1);

  // Resync local state if the active file tab changes
  useEffect(() => {
    setLocalContent(state.fileContents?.[filePath] || '');
  }, [filePath, state.fileContents]);

  const handleChange = (e) => {
    const newVal = e.target.value;
    setLocalContent(newVal); // Synchronous update for the typing experience

    // Asynchronous dispatch to your state engine
    state((draft) => {
      draft.fileContents = {
        ...draft.fileContents,
        [filePath]: newVal,
      };
    });

    // Save to Local FS if applicable
    if (fs.mode === 'local') {
      const currentTab = tabState.openTabs.find((t) => t.id === filePath);
      const handle = currentTab?.fsHandle;
      if (handle) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(async () => {
          try {
            const writable = await handle.createWritable();
            await writable.write(newVal);
            await writable.close();
            console.log('Saved to FS:', filePath);
          } catch (err) {
            console.error('Failed to save to FS:', err);
          }
        }, 1000);
      }
    }
  };

  // Flush changes to disk on window reload/close
  useEffect(() => {
    if (fs.mode !== 'local') return;

    const flush = async () => {
      const currentTab = tabState.openTabs.find((t) => t.id === filePath);
      const handle = currentTab?.fsHandle;
      if (handle && localContent !== state.fileContents?.[filePath]) {
        try {
          const writable = await handle.createWritable();
          await writable.write(localContent);
          await writable.close();
          console.log('Flushed to FS on exit:', filePath);
        } catch (err) {
          console.error('Failed to flush to FS on exit:', err);
        }
      }
    };

    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [fs.mode, filePath, localContent, state.fileContents, tabState.openTabs]);

  const highlightCode = (code) => {
    if (!code) return '';
    let escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Protect tokens by replacing them with unmatchable placeholders first
    const tokens = [];
    const pushToken = (val, type) => {
      tokens.push(`<span class="${styles[type]}">${val}</span>`);
      return `\u0001${tokens.length - 1}\u0002`;
    };

    escaped = escaped.replace(/(".*?"|'.*?'|`.*?`)/g, (m) => pushToken(m, 'hl-str'));
    escaped = escaped.replace(
      /\b(export|default|function|return|import|from|const|let|var|if|else|for|while|class|extends|new|true|false|null|undefined)\b/g,
      (m) => pushToken(m, 'hl-kw'),
    );
    escaped = escaped.replace(
      /(&lt;\/?)([a-zA-Z0-9]+)/g,
      (_m, p1, p2) => `${p1}${pushToken(p2, 'hl-tag')}`,
    );
    escaped = escaped.replace(/\b([a-zA-Z0-9_]+)(?=\()/g, (m) => pushToken(m, 'hl-func'));
    escaped = escaped.replace(/\b([a-zA-Z\-]+)(?==)/g, (m) => pushToken(m, 'hl-attr'));

    // Inject protected tokens back into the string
    tokens.forEach((tok, i) => {
      escaped = escaped.replace(`\u0001${i}\u0002`, tok);
    });

    return escaped;
  };

  return (
    <div className={styles.editorArea}>
      <div className={styles.editorHeader}>
        <Icons.File />
        {filePath}
      </div>

      {/* Scrollable Container with sticky line numbers and code layers */}
      <div className={`${styles.scrollContainer} scroll-hide`}>
        {/* Line Numbers Gutter */}
        <div className={styles.gutter}>
          <pre className={styles.gutterContent}>{linesArr.join('\n')}</pre>
        </div>

        <div className={styles.editorWrapper}>
          <textarea
            value={localContent}
            onChange={handleChange}
            spellCheck="false"
            className={styles.textarea}
          />

          <pre
            aria-hidden="true"
            className={styles.pre}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: used for code syntax highlighting
            dangerouslySetInnerHTML={{
              __html: highlightCode(localContent) + (localContent.endsWith('\n') ? ' ' : ''),
            }}
          />
        </div>
      </div>
    </div>
  );
}
