import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { Icons } from '@/components/Core/Base/Icons';
import { createState } from '@/components/Core/Base/State';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import styles from './EditorArea.module.css';

import CodeEditor from './CodeEditor';
import DiffHandler from './DiffHandler';
import EditorHeader from './EditorHeader';
import FindHandler from './FindHandler';
import Gutter from './Gutter';
import HistoryHandler from './HistoryHandler';
import SyncHandler from './SyncHandler';
import { highlightCode } from './highlighter';

export const EditorState = createState('EditorState');

export default function EditorArea({ file }) {
  const appState = AppState.useState();
  const tabState = TabState.useState();
  const { fs } = appState;
  const state = EditorState.useState();
  const filePath = file?.path?.join('/') || file?.name;

  const [localContent, setLocalContent] = useState(() => state.fileContents?.[filePath] || '');
  const [showFind, setShowFind] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(-1);
  const [matches, setMatches] = useState([]);
  const [showSideBySide, setShowSideBySide] = useState(false);
  const [diffActions, setDiffActions] = useState({});

  const leftScrollRef = useRef(null);
  const rightScrollRef = useRef(null);
  const isSyncingScroll = useRef(false);

  const handleScroll = (source, target) => {
    if (!isSyncingScroll.current && source.current && target.current) {
      isSyncingScroll.current = true;
      target.current.scrollTop = source.current.scrollTop;
      target.current.scrollLeft = source.current.scrollLeft;
      requestAnimationFrame(() => {
        isSyncingScroll.current = false;
      });
    }
  };

  // Generate line numbers array based on line breaks
  const linesCount = localContent.split('\n').length;
  const linesArr = Array.from({ length: linesCount }, (_, i) => i + 1);

  const handleChange = (e) => {
    const newVal = e.target.value;
    setLocalContent(newVal); // Synchronous update for the typing experience

    // Asynchronous dispatch to your state engine
    state((draft) => {
      draft.fileContents = {
        ...draft.fileContents,
        [filePath]: newVal,
      };

      // Clear redo history on manual edit
      if (draft.history?.[filePath]) {
        draft.history[filePath].future = [];
      }

      // Clear pending diffs on manual edit to avoid index drift
      if (draft.pendingDiffs?.[filePath]) {
        const nextDiffs = { ...draft.pendingDiffs };
        delete nextDiffs[filePath];
        draft.pendingDiffs = nextDiffs;
      }
    });
  };

  const scrollContainerRef = useRef(null);

  const hasDiff = !!state.pendingDiffs?.[filePath];
  const diffData = state.pendingDiffs?.[filePath];
  const selectedLines = state.selectedLines?.[filePath] || [];

  // biome-ignore lint/correctness/useExhaustiveDependencies: proxy state needs specific primitive triggers
  const highlightedLocalCode = useMemo(() => {
    return highlightCode(localContent, filePath, state, styles, showFind, findQuery, matchIndex);
  }, [localContent, filePath, diffData, selectedLines, showFind, findQuery, matchIndex]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: proxy state needs specific primitive triggers
  const highlightedOriginalCode = useMemo(() => {
    if (!diffData?.originalContent) return '';
    return highlightCode(
      diffData.originalContent,
      filePath,
      state,
      styles,
      showFind,
      findQuery,
      matchIndex,
    );
  }, [
    diffData?.originalContent,
    filePath,
    diffData,
    selectedLines,
    showFind,
    findQuery,
    matchIndex,
  ]);

  return (
    <div className={styles.editorArea}>
      <HistoryHandler
        filePath={filePath}
        localContent={localContent}
        setLocalContent={setLocalContent}
        state={state}
      />
      <EditorHeader
        filePath={filePath}
        showFind={showFind}
        setShowFind={setShowFind}
        hasDiff={hasDiff}
        handleApprove={diffActions.handleApprove}
        handleUndo={diffActions.handleUndo}
        showSideBySide={showSideBySide}
        setShowSideBySide={setShowSideBySide}
      />

      <FindHandler
        localContent={localContent}
        scrollContainerRef={scrollContainerRef}
        showFind={showFind}
        setShowFind={setShowFind}
        findQuery={findQuery}
        setFindQuery={setFindQuery}
        replaceQuery={replaceQuery}
        setReplaceQuery={setReplaceQuery}
        matchIndex={matchIndex}
        setMatchIndex={setMatchIndex}
        matches={matches}
        setMatches={setMatches}
        handleChange={handleChange}
      />

      <SyncHandler
        fs={fs}
        filePath={filePath}
        localContent={localContent}
        state={state}
        tabState={tabState}
      />

      <DiffHandler
        filePath={filePath}
        localContent={localContent}
        setLocalContent={setLocalContent}
        state={state}
        fs={fs}
        onStateChange={setDiffActions}
      />

      {showSideBySide && hasDiff ? (
        <div className={styles.sideBySideContainer}>
          <div className={styles.sideBySidePane}>
            <div className={styles.paneHeader}>
              <Icons.History /> Original
            </div>
            <div
              ref={leftScrollRef}
              onScroll={() => handleScroll(leftScrollRef, rightScrollRef)}
              className={`${styles.sideBySideScroll} scroll-hide`}
            >
              <Gutter linesArr={diffData.originalContent.split('\n').map((_, i) => i + 1)} />
              <CodeEditor
                localContent={diffData.originalContent}
                highlightedCode={highlightedOriginalCode}
                readOnly={true}
                cursorPos={state.cursorPos?.[filePath]}
                scrollContainerRef={leftScrollRef}
              />
            </div>
          </div>
          <div className={styles.sideBySidePane}>
            <div className={styles.paneHeader}>
              <Icons.Check /> Modified
            </div>
            <div
              ref={rightScrollRef}
              onScroll={() => handleScroll(rightScrollRef, leftScrollRef)}
              className={`${styles.sideBySideScroll} scroll-hide`}
            >
              <Gutter
                linesArr={linesArr}
                selectedLines={selectedLines}
                toggleLine={diffActions.toggleLine}
              />
              <CodeEditor
                localContent={localContent}
                handleChange={handleChange}
                highlightedCode={highlightedLocalCode}
                onCursorUpdate={diffActions.handleCursorUpdate}
                cursorPos={state.cursorPos?.[filePath]}
                scrollContainerRef={rightScrollRef}
              />
            </div>
          </div>
        </div>
      ) : (
        <div ref={scrollContainerRef} className={`${styles.scrollContainer} scroll-hide`}>
          <Gutter
            linesArr={linesArr}
            selectedLines={selectedLines}
            toggleLine={diffActions.toggleLine}
          />

          <CodeEditor
            localContent={localContent}
            handleChange={handleChange}
            highlightedCode={highlightedLocalCode}
            onCursorUpdate={diffActions.handleCursorUpdate}
            cursorPos={state.cursorPos?.[filePath]}
            scrollContainerRef={scrollContainerRef}
          />
        </div>
      )}
    </div>
  );
}
