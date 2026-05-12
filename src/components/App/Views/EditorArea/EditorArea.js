import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { Icons } from '@/components/Core/Base/Icons';
import { createState } from '@/components/Core/Base/State';
import React, { useState, useRef } from 'react';
import styles from './EditorArea.module.css';

import CodeEditor from './CodeEditor';
import useCompletion from './CompletionHandler';
import DiffHandler from './DiffHandler';
import EditorHeader from './EditorHeader';
import FindHandler from './FindHandler';
import Gutter from './Gutter';
import HistoryHandler from './HistoryHandler';
import SyncHandler from './SyncHandler';
import { highlightCode } from './highlighter';
import { formatCode } from '@/utils/formatter';

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
  const cursorPos = state.cursorPos?.[filePath];
  const aiCompletionEnabled = state.aiCompletionEnabled === true;

  const { suggestion, cancelSuggestion, loading } = useCompletion({
    localContent,
    cursorPos,
    filePath,
    enabled: !hasDiff && aiCompletionEnabled,
    onDebugUpdate: (debug) => {
      state((draft) => {
        draft.aiCompletionDebug = debug;
      });
    },
  });

  // Sync loading state to global EditorState
  React.useEffect(() => {
    state((draft) => {
      if (!draft.isCompleting) draft.isCompleting = {};
      draft.isCompleting[filePath] = loading;
    });
  }, [loading, filePath, state]);

  React.useEffect(() => {
    if (!aiCompletionEnabled) {
      cancelSuggestion();
    }
  }, [aiCompletionEnabled, cancelSuggestion]);

  const handleAcceptSuggestion = (text) => {
    if (!cursorPos) return;
    const { index } = cursorPos;
    const newVal = localContent.substring(0, index) + text + localContent.substring(index);
    const nextIndex = index + text.length;
    const textBeforeCursor = newVal.substring(0, nextIndex);
    const linesBeforeCursor = textBeforeCursor.split('\n');

    handleChange({ target: { value: newVal } });
    cancelSuggestion();
    diffActions.handleCursorUpdate?.({
      line: linesBeforeCursor.length,
      col: linesBeforeCursor[linesBeforeCursor.length - 1].length + 1,
      index: nextIndex,
    });
  };

  const handleFormat = () => {
    const formatted = formatCode(localContent, filePath);
    if (formatted !== localContent) {
      handleChange({ target: { value: formatted } });
    }
  };

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
        handleFormat={handleFormat}
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
                highlightedCode={highlightCode(
                  diffData.originalContent,
                  filePath,
                  state,
                  styles,
                  showFind,
                  findQuery,
                  matchIndex,
                  undefined,
                  state.cursorPos?.[filePath],
                )}
                readOnly={true}
                cursorPos={state.cursorPos?.[filePath]}
                scrollContainerRef={leftScrollRef}
                filePath={filePath}
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
                highlightedCode={highlightCode(
                  localContent,
                  filePath,
                  state,
                  styles,
                  showFind,
                  findQuery,
                  matchIndex,
                  suggestion,
                  cursorPos,
                )}
                onCursorUpdate={diffActions.handleCursorUpdate}
                cursorPos={state.cursorPos?.[filePath]}
                scrollContainerRef={rightScrollRef}
                filePath={filePath}
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
            highlightedCode={highlightCode(
              localContent,
              filePath,
              state,
              styles,
              showFind,
              findQuery,
              matchIndex,
              suggestion,
              cursorPos,
            )}
            onCursorUpdate={diffActions.handleCursorUpdate}
            cursorPos={cursorPos}
            scrollContainerRef={scrollContainerRef}
            suggestion={suggestion}
            onAcceptSuggestion={handleAcceptSuggestion}
            onCancelSuggestion={cancelSuggestion}
            filePath={filePath}
          />
        </div>
      )}
    </div>
  );
}
