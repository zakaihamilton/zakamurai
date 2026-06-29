import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import Node from '@/components/state/Node';
import { createState } from '@/components/state/State';
import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import styles from './EditorArea.module.css';

import { DEFAULT_CONTENTS, SCRATCH_CONTENTS } from '@/components/Storage/InitialData';
import Settings from '@/components/Storage/Settings';
import { FILE_VIEW_TYPES } from '@/utils/fileViews';
import { formatCode } from '@/utils/formatter';
import useCompletion from './CompletionHandler';
import DiffHandler from './DiffHandler';
import EditorHeader from './EditorHeader';
import FindHandler from './FindHandler';
import { applyFoldedContentEdit, getExpandedFoldedSelection } from './Folding';
import HistoryHandler from './HistoryHandler';
import SyncHandler from './SyncHandler';

import useAssociationNavigator from './AssociationNavigator';
import useCodeFolding from './CodeFolding';
import useFileLoader from './FileLoader';
import useHighlightLoader from './HighlightLoader';
import useScrollHandler from './ScrollHandler';
import SideBySideEditorView from './SideBySideEditorView';
import SingleEditorView from './SingleEditorView';

export const EditorState = createState('EditorState');
const EditorAreaUiState = createState('EditorAreaUiState');

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

let commandKeyPressed = false;

export default function EditorArea({ file, fsHandle }) {
  return (
    <Node id={file?.path?.join('/') || file?.name || 'EditorArea'}>
      <EditorAreaInner file={file} fsHandle={fsHandle} />
    </Node>
  );
}

function EditorAreaInner({ file, fsHandle }) {
  const appState = AppState.useState();
  const tabState = TabState.useState();
  const { fs } = appState;
  const state = EditorState.useState();
  const filePath = file?.path?.join('/') || file?.name;
  const fallbackContent = getTemplateContents()[filePath] ?? file?.content ?? '';

  const editorAreaUiState = EditorAreaUiState.useState(null, {
    localContent: state.fileContents?.[filePath] ?? fallbackContent,
    showFind: false,
    findQuery: '',
    replaceQuery: '',
    matchIndex: -1,
    matches: [],
    showSideBySide: false,
    diffActions: {},
    collapsedFolds: {},
  });
  const {
    localContent = state.fileContents?.[filePath] ?? fallbackContent,
    showFind = false,
    findQuery = '',
    replaceQuery = '',
    matchIndex = -1,
    matches = [],
    showSideBySide = false,
    diffActions = {},
    collapsedFolds = {},
  } = editorAreaUiState || {};

  const isReadOnly = state.isReadOnly ?? Settings.getEditorReadOnly(false);
  const [isCommandPressed, setIsCommandPressed] = useState(() => commandKeyPressed);
  const navigationLinksEnabled = isReadOnly || isCommandPressed;

  const setEditorAreaValue = useCallback(
    (key, nextValue) => {
      editorAreaUiState((draft) => {
        draft[key] = typeof nextValue === 'function' ? nextValue(draft[key]) : nextValue;
      });
    },
    [editorAreaUiState],
  );
  const setLocalContent = useCallback(
    (nextValue) => setEditorAreaValue('localContent', nextValue),
    [setEditorAreaValue],
  );
  const setShowFind = useCallback(
    (nextValue) => setEditorAreaValue('showFind', nextValue),
    [setEditorAreaValue],
  );
  const setFindQuery = useCallback(
    (nextValue) => setEditorAreaValue('findQuery', nextValue),
    [setEditorAreaValue],
  );
  const setReplaceQuery = useCallback(
    (nextValue) => setEditorAreaValue('replaceQuery', nextValue),
    [setEditorAreaValue],
  );
  const setMatchIndex = useCallback(
    (nextValue) => setEditorAreaValue('matchIndex', nextValue),
    [setEditorAreaValue],
  );
  const setMatches = useCallback(
    (nextValue) => setEditorAreaValue('matches', nextValue),
    [setEditorAreaValue],
  );
  const setShowSideBySide = useCallback(
    (nextValue) => setEditorAreaValue('showSideBySide', nextValue),
    [setEditorAreaValue],
  );
  const setDiffActions = useCallback(
    (nextValue) => setEditorAreaValue('diffActions', nextValue),
    [setEditorAreaValue],
  );
  const setCollapsedFolds = useCallback(
    (nextValue) => setEditorAreaValue('collapsedFolds', nextValue),
    [setEditorAreaValue],
  );
  const setIsReadOnly = useCallback(
    (nextValue) => {
      state((draft) => {
        const current = draft.isReadOnly ?? Settings.getEditorReadOnly(false);
        const resolvedValue = typeof nextValue === 'function' ? nextValue(current) : nextValue;
        draft.isReadOnly = resolvedValue;
        Settings.setEditorReadOnly(resolvedValue);
      });
    },
    [state],
  );
  const localContentRef = useRef(localContent);

  useEffect(() => {
    localContentRef.current = localContent;
  }, [localContent]);
  // Sync localContent when state.fileContents changes externally (e.g. from AI)
  useFileLoader({
    filePath,
    localContent,
    setLocalContent,
    fallbackContent,
    fs,
    fsHandle,
    state,
  });

  const { foldStarts, collapsedFoldIds, visibleFoldedContent, toggleFold, foldLabel } =
    useCodeFolding({
      filePath,
      localContent,
      collapsedFolds,
      setCollapsedFolds,
    });

  const linesCount = useMemo(() => countLines(localContent), [localContent]);
  const editorContent = visibleFoldedContent.content;
  const editorLineItems = visibleFoldedContent.lineItems;
  const hasCollapsedFolds = visibleFoldedContent.hasCollapsedFolds;

  const handleChange = (e) => {
    const newVal = hasCollapsedFolds
      ? applyFoldedContentEdit(localContentRef.current, e.target.value, editorLineItems)
      : e.target.value;
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
  const shouldScrollRef = useRef(null);

  const hasDiff = !!state.pendingDiffs?.[filePath];
  const diffData = state.pendingDiffs?.[filePath];
  const selectedLines = state.selectedLines?.[filePath] || [];
  const cursorPos = state.cursorPos?.[filePath];
  const aiCompletionEnabled = state.aiCompletionEnabled === true;

  const { associatedPath, handleNavigateToAssociated, handleJumpToTarget } =
    useAssociationNavigator({
      filePath,
      cursorPos,
      localContentRef,
      state,
      tabState,
      shouldScrollRef,
    });

  useScrollHandler({
    filePath,
    state,
    scrollContainerRef,
    shouldScrollRef,
  });

  const { suggestion, cancelSuggestion, loading } = useCompletion({
    localContent,
    cursorPos,
    filePath,
    enabled: !hasDiff && !hasCollapsedFolds && aiCompletionEnabled,
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

  const handleSelectView = useCallback(
    (viewType) => {
      tabState((draft) => {
        draft.openTabs = draft.openTabs.map((tab) =>
          tab.id === filePath ? { ...tab, viewType } : tab,
        );
      });
    },
    [filePath, tabState],
  );

  useEffect(() => {
    const updateCommandPressed = (nextValue) => {
      commandKeyPressed = nextValue;
      setIsCommandPressed(nextValue);
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Meta') updateCommandPressed(true);
    };
    const handleKeyUp = (e) => {
      if (e.key === 'Meta') updateCommandPressed(false);
    };
    const handleMouseModifier = (e) => {
      updateCommandPressed(e.metaKey);
    };
    const handleBlur = () => {
      updateCommandPressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseModifier);
    window.addEventListener('mousemove', handleMouseModifier);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseModifier);
      window.removeEventListener('mousemove', handleMouseModifier);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const { highlightedCode, originalHighlightedCode } = useHighlightLoader({
    showSideBySide,
    hasDiff,
    localContent,
    editorContent,
    filePath,
    state,
    styles,
    showFind,
    findQuery,
    matchIndex,
    suggestion,
    cursorPos,
    navigationLinksEnabled,
    diffData,
  });

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
        associatedPath={associatedPath}
        onNavigateToAssociated={handleNavigateToAssociated}
        isReadOnly={isReadOnly}
        setIsReadOnly={setIsReadOnly}
        fileName={file?.name}
        viewType={FILE_VIEW_TYPES.EDITOR}
        onSelectView={handleSelectView}
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
        <SideBySideEditorView
          styles={styles}
          diffData={diffData}
          isReadOnly={isReadOnly}
          navigationLinksEnabled={navigationLinksEnabled}
          filePath={filePath}
          handleNavigateToAssociated={handleNavigateToAssociated}
          fileContents={state.fileContents}
          handleJumpToTarget={handleJumpToTarget}
          linesCount={linesCount}
          selectedLines={selectedLines}
          diffActions={diffActions}
          localContent={localContent}
          highlightedCode={highlightedCode}
          originalHighlightedCode={originalHighlightedCode}
          handleChange={handleChange}
          cursorPos={state.cursorPos?.[filePath]}
        />
      ) : (
        <SingleEditorView
          styles={styles}
          scrollContainerRef={scrollContainerRef}
          linesCount={linesCount}
          editorLineItems={editorLineItems}
          selectedLines={selectedLines}
          diffActions={diffActions}
          foldStarts={foldStarts}
          collapsedFoldIds={collapsedFoldIds}
          toggleFold={toggleFold}
          foldLabel={foldLabel}
          editorContent={editorContent}
          handleChange={handleChange}
          highlightedCode={highlightedCode}
          hasCollapsedFolds={hasCollapsedFolds}
          onCopySelection={
            hasCollapsedFolds
              ? (projectedContent, start, end) =>
                  getExpandedFoldedSelection(
                    localContentRef.current,
                    projectedContent,
                    editorLineItems,
                    start,
                    end,
                  )
              : undefined
          }
          cursorPos={cursorPos}
          suggestion={suggestion}
          onAcceptSuggestion={handleAcceptSuggestion}
          cancelSuggestion={cancelSuggestion}
          filePath={filePath}
          isReadOnly={isReadOnly}
          navigationLinksEnabled={navigationLinksEnabled}
          handleNavigateToAssociated={handleNavigateToAssociated}
          fileContents={state.fileContents}
          handleJumpToTarget={handleJumpToTarget}
        />
      )}
    </div>
  );
}
