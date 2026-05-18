import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { Icons } from '@/components/Core/Base/Icons';
import { createState } from '@/components/Core/Base/State';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import styles from './EditorArea.module.css';

import { DEFAULT_CONTENTS, SCRATCH_CONTENTS } from '@/components/Storage/InitialData';
import Settings from '@/components/Storage/Settings';
import { formatCode } from '@/utils/formatter';
import CodeEditor from './CodeEditor';
import useCompletion from './CompletionHandler';
import DiffHandler from './DiffHandler';
import EditorHeader from './EditorHeader';
import FindHandler from './FindHandler';
import Gutter from './Gutter';
import HistoryHandler from './HistoryHandler';
import SyncHandler from './SyncHandler';
import { highlightCode } from './highlighter';

export const EditorState = createState('EditorState');

const countLines = (value) => {
  if (!value) return 1;
  let count = 1;
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) === 10) count++;
  }
  return count;
};

const getTemplateContents = () =>
  Settings.getTemplate() === 'scratch' ? SCRATCH_CONTENTS : DEFAULT_CONTENTS;

export default function EditorArea({ file, fsHandle }) {
  const appState = AppState.useState();
  const tabState = TabState.useState();
  const { fs } = appState;
  const state = EditorState.useState();
  const filePath = file?.path?.join('/') || file?.name;
  const fallbackContent = getTemplateContents()[filePath] ?? file?.content ?? '';

  const [localContent, setLocalContent] = useState(
    () => state.fileContents?.[filePath] ?? fallbackContent,
  );
  const localContentRef = useRef(localContent);
  const loadedLocalFileRef = useRef(null);

  useEffect(() => {
    localContentRef.current = localContent;
  }, [localContent]);
  const [showFind, setShowFind] = useState(false);

  // Sync localContent when state.fileContents changes externally (e.g. from AI)
  useEffect(() => {
    const externalContent = state.fileContents?.[filePath] ?? fallbackContent;
    if (externalContent !== localContent) {
      setLocalContent(externalContent);
    }
  }, [state.fileContents?.[filePath], filePath, fallbackContent, localContent]);

  useEffect(() => {
    if ((fs.mode !== 'local' && fs.mode !== 'opfs') || !filePath || !fs.readFile) return;
    if (loadedLocalFileRef.current === filePath) return;

    let cancelled = false;
    const startingContent = localContentRef.current;
    const loadContent = async () => {
      const handle = fsHandle || (await fs.getFileHandleAtPath?.(filePath));
      if (!handle || cancelled) return;

      const content = await fs.readFile(handle);
      if (cancelled) return;

      loadedLocalFileRef.current = filePath;
      setLocalContent((current) => (current === startingContent ? content : current));
      state((draft) => {
        if (localContentRef.current === startingContent) {
          draft.fileContents = { ...draft.fileContents, [filePath]: content };
        }
      });
    };

    loadContent().catch((err) => {
      console.error(`Failed to load editor content for ${filePath}`, err);
    });

    return () => {
      cancelled = true;
    };
  }, [filePath, fs, fsHandle, state]);

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

  const linesCount = useMemo(() => countLines(localContent), [localContent]);

  const handleChange = (e) => {
    const newVal = e.target.value;
    setLocalContent(newVal); // Synchronous update for the typing experience

    // Asynchronous dispatch to your state engine
    state((draft) => {
      draft.fileContents = { ...draft.fileContents, [filePath]: newVal };

      // Clear redo history on manual edit
      if (draft.history?.[filePath]) {
        const history = { ...draft.history };
        const hist = { ...history[filePath], future: [] };
        history[filePath] = hist;
        draft.history = history;
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
  useEffect(() => {
    state((draft) => {
      if (!draft.isCompleting) draft.isCompleting = {};
      draft.isCompleting[filePath] = loading;
    });
  }, [loading, filePath, state]);

  useEffect(() => {
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: state is intentionally omitted to prevent re-highlighting on every state change
  const highlightedCode = useMemo(() => {
    return highlightCode(
      localContent,
      filePath,
      state,
      styles,
      showFind,
      findQuery,
      matchIndex,
      suggestion,
      cursorPos,
    );
  }, [
    localContent,
    filePath,
    state.pendingDiffs?.[filePath],
    state.selectedLines?.[filePath],
    showFind,
    findQuery,
    matchIndex,
    suggestion,
    cursorPos,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: state is intentionally omitted to prevent re-highlighting on every state change
  const originalHighlightedCode = useMemo(() => {
    if (!showSideBySide || !diffData) return '';
    return highlightCode(
      diffData.originalContent,
      filePath,
      state,
      styles,
      showFind,
      findQuery,
      matchIndex,
      undefined,
      state.cursorPos?.[filePath],
    );
  }, [
    showSideBySide,
    diffData,
    filePath,
    state.pendingDiffs?.[filePath],
    state.selectedLines?.[filePath],
    showFind,
    findQuery,
    matchIndex,
    state.cursorPos?.[filePath],
  ]);

  return (
    <div className={styles.editorArea}>
      <HistoryHandler filePath={filePath} localContent={localContent} state={state} />
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
              className={`${styles.sideBySideScroll} scrollHide`}
            >
              <Gutter linesCount={countLines(diffData.originalContent)} scrollRef={leftScrollRef} />
              <CodeEditor
                localContent={diffData.originalContent}
                highlightedCode={originalHighlightedCode}
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
              className={`${styles.sideBySideScroll} scrollHide`}
            >
              <Gutter
                linesCount={linesCount}
                selectedLines={selectedLines}
                toggleLine={diffActions.toggleLine}
                scrollRef={rightScrollRef}
              />
              <CodeEditor
                localContent={localContent}
                handleChange={handleChange}
                highlightedCode={highlightedCode}
                onCursorUpdate={diffActions.handleCursorUpdate}
                cursorPos={state.cursorPos?.[filePath]}
                scrollContainerRef={rightScrollRef}
                filePath={filePath}
              />
            </div>
          </div>
        </div>
      ) : (
        <div ref={scrollContainerRef} className={`${styles.scrollContainer} scrollHide`}>
          <Gutter
            linesCount={linesCount}
            selectedLines={selectedLines}
            toggleLine={diffActions.toggleLine}
            scrollRef={scrollContainerRef}
          />

          <CodeEditor
            localContent={localContent}
            handleChange={handleChange}
            highlightedCode={highlightedCode}
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
