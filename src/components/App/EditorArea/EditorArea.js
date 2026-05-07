import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createState } from '../../Core/Base/State';
import { AppState } from '../App';
import { TabState } from '../TabBar';
import styles from './EditorArea.module.css';

import CodeEditor from './CodeEditor';
// Sub-components
import EditorHeader from './EditorHeader';
import FindReplaceBar from './FindReplaceBar';
import Gutter from './Gutter';

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
  const [showFind, setShowFind] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(-1);
  const [matches, setMatches] = useState([]);

  // Generate line numbers array based on line breaks
  const linesCount = localContent.split('\n').length;
  const linesArr = Array.from({ length: linesCount }, (_, i) => i + 1);

  // Resync local state if the active file tab changes or content is updated externally (e.g. by AI)
  useEffect(() => {
    setLocalContent(state.fileContents?.[filePath] || '');
  }, [filePath, state.fileContents?.[filePath]]);

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

    const fileDiff = state.pendingDiffs?.[filePath];
    const diffs = fileDiff?.diffs || [];
    const selectedLines = state.selectedLines?.[filePath] || [];

    const sortedDiffs = [...diffs].sort((a, b) => b.start - a.start);

    // Let's stick to the original logic for diffs but add line selection
    let escaped = code;
    // Mark diffs with index for tracking original content
    for (let i = 0; i < sortedDiffs.length; i++) {
      const diff = sortedDiffs[i];
      escaped = `${escaped.substring(0, diff.start)}\u0003${i}\u0003${escaped.substring(
        diff.start,
        diff.end,
      )}\u0004${escaped.substring(diff.end)}`;
    }

    escaped = escaped.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Mark selected lines by wrapping the whole line if needed
    // This is tricky with the existing highlight logic.
    // Let's do it after escaping but before tokens.

    // Protect tokens by replacing them with unmatchable placeholders first
    const tokens = [];
    const pushToken = (val, type) => {
      tokens.push(`<span class="${styles[type]}">${val}</span>`);
      return `\u0001${tokens.length - 1}\u0002`;
    };

    // 1. Comments (highest priority)
    escaped = escaped.replace(/(\/\/.+)/g, (m) => pushToken(m, 'hl-comment'));
    escaped = escaped.replace(/(\/\*[\s\S]*?\*\/)/g, (m) => pushToken(m, 'hl-comment'));

    // 2. Strings
    escaped = escaped.replace(/(".*?"|'.*?'|`.*?`)/g, (m) => pushToken(m, 'hl-str'));

    // 3. Keywords
    escaped = escaped.replace(
      /\b(export|default|function|return|import|from|const|let|var|if|else|for|while|class|extends|new|true|false|null|undefined|async|await|try|catch|finally|throw|break|continue|case|switch|type|interface|enum|public|private|protected|static|readonly)\b/g,
      (m) => pushToken(m, 'hl-kw'),
    );

    // 4. Numbers
    escaped = escaped.replace(/\b(\d+)\b/g, (m) => pushToken(m, 'hl-num'));

    // 5. CSS specific (if filePath ends with .css)
    if (filePath?.endsWith('.css')) {
      // Properties
      escaped = escaped.replace(/([a-zA-Z\-]+)(?=\s*:)/g, (m) => pushToken(m, 'hl-prop'));
      // Selectors (basic)
      escaped = escaped.replace(/^([.#a-zA-Z0-9_\-\[\]="':*]+)(?=\s*\{)/gm, (m) =>
        pushToken(m, 'hl-tag'),
      );
      // Values (after colon, before semicolon)
      escaped = escaped.replace(/(?<=:\s*)([^;\}]+)(?=;|\})/g, (m) => {
        // Highlight hex colors within values
        let val = m.replace(/(#[a-fA-F0-9]{3,8})/g, (c) => pushToken(c, 'hl-num'));
        // Highlight units
        val = val.replace(
          /(\d+)(px|rem|em|%|vh|vw|ms|s|deg)/g,
          (_m2, p1, p2) => `${pushToken(p1, 'hl-num')}${pushToken(p2, 'hl-kw')}`,
        );
        return pushToken(val, 'hl-val');
      });
      // Variables
      escaped = escaped.replace(/(var\(--[a-zA-Z0-9\-]+\))/g, (m) => pushToken(m, 'hl-func'));
    } else {
      // JSX/HTML Tags
      escaped = escaped.replace(
        /(&lt;\/?)([a-zA-Z0-9]+)/g,
        (_m, p1, p2) => `${p1}${pushToken(p2, 'hl-tag')}`,
      );
      // Functions
      escaped = escaped.replace(/\b([a-zA-Z0-9_]+)(?=\()/g, (m) => pushToken(m, 'hl-func'));
      // Attributes
      escaped = escaped.replace(/\b([a-zA-Z\-]+)(?==)/g, (m) => pushToken(m, 'hl-attr'));
    }

    // Reconstruction with Search Highlights
    let matchCounter = 0;
    const searchRegex =
      showFind && findQuery
        ? new RegExp(
            findQuery
              .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;'),
            'gi',
          )
        : null;

    const highlightText = (text) => {
      if (!searchRegex) return text;
      return text.replace(searchRegex, (m) => {
        const cls = matchCounter === matchIndex ? 'hl-match-active' : 'hl-match';
        matchCounter++;
        return `<span class="${styles[cls]}">${m}</span>`;
      });
    };

    // We need to iterate through 'escaped' and replace placeholders AND highlight text in order
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional for tracking
    const parts = escaped.split(/(\u0001\d+\u0002)/);
    escaped = parts
      .map((part) => {
        if (part.startsWith('\u0001') && part.endsWith('\u0002')) {
          const idx = Number.parseInt(part.substring(1, part.length - 1));
          let tok = tokens[idx];
          if (searchRegex) {
            // Highlight text inside token spans
            tok = tok.replace(/(>)([^<]+)(<)/g, (_m, p1, p2, p3) => {
              return p1 + highlightText(p2) + p3;
            });
          }
          return tok;
        }
        return highlightText(part);
      })
      .join('');

    // Replace diff markers with spans including original content
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional for tracking
    escaped = escaped.replace(/\u0003(\d+)\u0003/g, (_m, idx) => {
      const diff = sortedDiffs[Number(idx)];
      const original = (diff.original || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      return `<span class="${styles.diffHighlight}" data-original="${original || 'Added'}">`;
    });
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional for tracking
    escaped = escaped.replace(/\u0004/g, '</span>');

    // Add line selection backgrounds
    const linesArr = escaped.split('\n');
    const finalLines = linesArr.map((line, i) => {
      const isSelected = selectedLines.includes(i + 1);
      if (isSelected) {
        return `<span class="${styles.selectedLineRow}">${line || ' '}</span>`;
      }
      return line;
    });

    return finalLines.join('\n');
  };

  const handleApprove = () => {
    state((draft) => {
      if (draft.pendingDiffs) {
        const nextDiffs = { ...draft.pendingDiffs };
        delete nextDiffs[filePath];
        draft.pendingDiffs = nextDiffs;
      }
    });
  };

  const handleUndo = async () => {
    const diff = state.pendingDiffs?.[filePath];
    if (diff) {
      const prevContent = diff.originalContent;
      state((draft) => {
        draft.fileContents = { ...draft.fileContents, [filePath]: prevContent };
        if (draft.pendingDiffs) {
          const nextDiffs = { ...draft.pendingDiffs };
          delete nextDiffs[filePath];
          draft.pendingDiffs = nextDiffs;
        }
      });
      setLocalContent(prevContent);

      try {
        if (fs?.rootHandle && fs?.writeFileAtPath) {
          await fs.writeFileAtPath(filePath, prevContent);
        }
      } catch (err) {
        console.error('Failed to undo in FS:', err);
      }
    }
  };

  const toggleLine = (line) => {
    const lineNum = Number(line);
    state((draft) => {
      if (!draft.selectedLines) draft.selectedLines = {};
      const current = draft.selectedLines[filePath] || [];
      const exists = current.some((l) => Number(l) === lineNum);

      if (exists) {
        draft.selectedLines[filePath] = current.filter((l) => Number(l) !== lineNum);
      } else {
        draft.selectedLines[filePath] = [...current, lineNum];
      }
      draft.selectedLines = { ...draft.selectedLines };
    });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowFind((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleFind = useCallback(() => {
    if (!findQuery) {
      setMatches([]);
      setMatchIndex(-1);
      return;
    }
    const escapedQuery = findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'gi');
    const newMatches = [];
    let match;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex match loop
    while ((match = regex.exec(localContent)) !== null) {
      const before = localContent.substring(0, match.index);
      const line = before.split('\n').length;
      const lineStart = before.lastIndexOf('\n') + 1;
      newMatches.push({
        line,
        index: match.index - lineStart,
        absoluteIndex: match.index,
        length: match[0].length,
      });
    }

    setMatches(newMatches);
    setMatchIndex((prev) => {
      if (newMatches.length === 0) return -1;
      if (prev === -1) return 0;
      return prev % newMatches.length;
    });
  }, [findQuery, localContent]);

  useEffect(() => {
    if (showFind) {
      handleFind();
    }
  }, [handleFind, showFind]);

  const handleReplace = () => {
    if (matchIndex === -1 || matches.length === 0) return;
    const match = matches[matchIndex];
    const newVal =
      localContent.substring(0, match.absoluteIndex) +
      replaceQuery +
      localContent.substring(match.absoluteIndex + match.length);

    handleChange({ target: { value: newVal } });
    // handleFind will be triggered by localContent change
  };

  const handleReplaceAll = () => {
    if (!findQuery) return;
    const escapedQuery = findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'gi');
    const newVal = localContent.replace(regex, () => replaceQuery);
    handleChange({ target: { value: newVal } });
    setShowFind(false);
  };

  // Scroll to match
  const scrollContainerRef = useRef(null);
  useEffect(() => {
    if (matchIndex !== -1 && matches[matchIndex] && scrollContainerRef.current) {
      const match = matches[matchIndex];
      const lineHeight = 1.6 * 14; // Approximate based on css
      const top = (match.line - 1) * lineHeight + 20; // 20 is padding
      scrollContainerRef.current.scrollTo({
        top: top - 100, // Center it a bit
        behavior: 'smooth',
      });
    }
  }, [matchIndex, matches]);

  const hasDiff = !!state.pendingDiffs?.[filePath];
  const selectedLines = state.selectedLines?.[filePath] || [];

  return (
    <div className={styles.editorArea}>
      <EditorHeader
        filePath={filePath}
        showFind={showFind}
        setShowFind={setShowFind}
        hasDiff={hasDiff}
        handleApprove={handleApprove}
        handleUndo={handleUndo}
      />

      <FindReplaceBar
        showFind={showFind}
        setShowFind={setShowFind}
        findQuery={findQuery}
        setFindQuery={setFindQuery}
        replaceQuery={replaceQuery}
        setReplaceQuery={setReplaceQuery}
        matches={matches}
        matchIndex={matchIndex}
        setMatchIndex={setMatchIndex}
        handleFind={handleFind}
        handleReplace={handleReplace}
        handleReplaceAll={handleReplaceAll}
      />

      <div ref={scrollContainerRef} className={`${styles.scrollContainer} scroll-hide`}>
        <Gutter linesArr={linesArr} selectedLines={selectedLines} toggleLine={toggleLine} />

        <CodeEditor
          localContent={localContent}
          handleChange={handleChange}
          highlightedCode={highlightCode(localContent)}
        />
      </div>
    </div>
  );
}
