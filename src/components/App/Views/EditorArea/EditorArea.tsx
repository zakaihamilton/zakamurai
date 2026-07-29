import { TabState } from '@/components/App/Panes/TabBar';
import { LogState } from '@/components/App/Views/LogArea';
import { useFileSystem } from '@/components/Storage';
import Node from '@/components/state/Node';
import { createState } from '@/components/state/State';
import { setInDraft } from '@/components/state/StateUtils';
import { FILE_VIEW_TYPES } from '@/utils/fileViews';
import { useCallback, useEffect, useRef } from 'react';
import useAssociationNavigator from './AssociationNavigator';
import useCompletion from './CompletionHandler';
import DiffHandler from './DiffHandler';
import styles from './EditorArea.module.css';
import EditorContent from './EditorContent';
import EditorHeader from './EditorHeader';
import FindHandler from './FindHandler';
import { getExpandedFoldedSelection } from './Folding';
import useHighlightLoader from './HighlightLoader';
import HistoryHandler from './HistoryHandler';
import useScrollHandler from './ScrollHandler';
import SyncHandler from './SyncHandler';
import type {
  DiffActions,
  EditorAreaProps,
  ExtendedEditorState,
  FindMatch,
  ScrollContainerRef,
  ShouldScrollRef,
} from './types';
import useEditorBuffer from './useEditorBuffer';
import useEditorNavigationMode from './useEditorNavigationMode';

export const EditorState = createState<ExtendedEditorState>('EditorState');

export default function EditorArea({ file, fsHandle }: EditorAreaProps) {
  return (
    <Node id={file?.path?.join('/') || file?.name || 'EditorArea'}>
      <EditorAreaInner file={file} fsHandle={fsHandle} />
    </Node>
  );
}

function EditorAreaInner({ file, fsHandle }: EditorAreaProps) {
  const tabState = TabState.useState(['activeTabId', 'openTabs']);
  const fs = useFileSystem();
  const state = EditorState.useState([
    'pendingDiffs',
    'pendingDeletions',
    'fileContents',
    'isReadOnly',
    'selectedLines',
    'cursorPos',
    'aiCompletionEnabled',
  ]);
  if (!state) return null;
  const filePath = file?.path?.join('/') || file?.name || '';
  const hasDiff = Boolean(state.pendingDiffs?.[filePath]);
  const hasPendingDeletion = Boolean(state.pendingDeletions?.[filePath]);
  const diffData = state.pendingDiffs?.[filePath];
  const buffer = useEditorBuffer({ file, filePath, fs, fsHandle, state });
  const {
    localContent,
    localContentRef,
    showFind,
    findQuery,
    replaceQuery,
    matchIndex,
    matches,
    showSideBySide,
    diffActions,
    setLocalContent,
    setShowFind,
    setFindQuery,
    setReplaceQuery,
    setMatchIndex,
    setMatches,
    setShowSideBySide,
    setDiffActions,
    handleChange,
    handleFormat,
    linesCount,
    editorContent,
    editorLineItems,
    hasCollapsedFolds,
    foldStarts,
    collapsedFoldIds,
    toggleFold,
    foldLabel,
  } = buffer;
  const isReadOnly = state.isReadOnly === true;
  const isCommandPressed = useEditorNavigationMode();
  const navigationLinksEnabled = isReadOnly || isCommandPressed;
  const reviewNavigationLinksEnabled = hasDiff ? false : navigationLinksEnabled;
  const scrollContainerRef = useRef<HTMLDivElement>(null) as ScrollContainerRef;
  const shouldScrollRef = useRef<ShouldScrollRef['current']>(null) as ShouldScrollRef;
  const selectedLines = state.selectedLines?.[filePath] || [];
  const cursorPos = state.cursorPos?.[filePath];
  const aiCompletionEnabled = state.aiCompletionEnabled === true;
  const { isAIProcessing = false } = LogState.useState(['isAIProcessing']) || {};

  const setIsReadOnly = useCallback(
    (nextValue: boolean | ((prev: boolean) => boolean)) => {
      state((draft) => {
        const current = draft.isReadOnly === true;
        draft.isReadOnly = typeof nextValue === 'function' ? nextValue(current) : nextValue;
      });
    },
    [state],
  );
  const { associatedPath, handleNavigateToAssociated, handleJumpToTarget } =
    useAssociationNavigator({
      filePath,
      cursorPos,
      localContentRef,
      state,
      tabState,
      shouldScrollRef,
    });
  useScrollHandler({ filePath, state, scrollContainerRef, shouldScrollRef });
  const { suggestion, setSuggestion, cancelSuggestion, loading, markSuggestionAccepted } =
    useCompletion({
      localContent,
      cursorPos,
      filePath,
      enabled: !hasDiff && !hasCollapsedFolds && aiCompletionEnabled && !isAIProcessing,
      onDebugUpdate: (debug) => {
        state((draft) => {
          draft.aiCompletionDebug = debug;
          if (debug.filePath) {
            setInDraft(draft, ['completionActivity', debug.filePath], {
              phase: debug.phase || '',
              model: debug.model || '',
              status: debug.status || 'idle',
            });
            setInDraft(draft, ['isCompleting', debug.filePath], debug.status === 'thinking');
          }
        });
      },
    });

  useEffect(() => {
    return () => {
      state((draft) => {
        setInDraft(draft, ['isCompleting', filePath], false);
        setInDraft(draft, ['completionActivity', filePath], {
          phase: '',
          model: '',
          status: 'idle',
        });
      });
    };
  }, [filePath, state]);
  useEffect(() => {
    if (!aiCompletionEnabled) cancelSuggestion();
  }, [aiCompletionEnabled, cancelSuggestion]);

  const handleAcceptSuggestion = (text: string) => {
    if (!cursorPos || cursorPos.index === undefined) return;
    const { index } = cursorPos;
    const nextContent = localContent.substring(0, index) + text + localContent.substring(index);
    const nextIndex = index + text.length;
    const linesBeforeCursor = nextContent.substring(0, nextIndex).split('\n');
    const isPartialAccept =
      suggestion && text.length < suggestion.length && suggestion.startsWith(text);
    if (isPartialAccept) markSuggestionAccepted();
    handleChange({ target: { value: nextContent } });
    if (isPartialAccept) setSuggestion(suggestion.slice(text.length));
    else cancelSuggestion();
    (diffActions as DiffActions).handleCursorUpdate?.({
      line: linesBeforeCursor.length,
      col: (linesBeforeCursor.at(-1)?.length ?? 0) + 1,
      index: nextIndex,
    });
  };
  const handleSelectView = useCallback(
    (viewType: string) => {
      tabState?.((draft) => {
        draft.openTabs = draft.openTabs.map((tab) =>
          tab.id === filePath ? { ...tab, viewType } : tab,
        );
      });
    },
    [filePath, tabState],
  );
  const { highlightedCode, originalHighlightedCode } = useHighlightLoader({
    showSideBySide,
    hasDiff,
    localContent,
    editorContent,
    filePath,
    state,
    showFind,
    findQuery,
    matchIndex,
    suggestion,
    cursorPos,
    navigationLinksEnabled: reviewNavigationLinksEnabled,
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
        hasPendingDeletion={hasPendingDeletion}
        handleApprove={(diffActions as DiffActions).handleApprove ?? (() => {})}
        handleUndo={(diffActions as DiffActions).handleUndo ?? (() => {})}
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
        matches={matches as FindMatch[]}
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
      <EditorContent
        showSideBySide={showSideBySide}
        hasDiff={hasDiff}
        sideBySideProps={{
          diffData: diffData!,
          isReadOnly,
          navigationLinksEnabled: reviewNavigationLinksEnabled,
          filePath,
          handleNavigateToAssociated,
          fileContents: state.fileContents,
          handleJumpToTarget,
          linesCount,
          selectedLines,
          diffActions: diffActions as DiffActions,
          localContent,
          highlightedCode,
          originalHighlightedCode,
          handleChange,
          cursorPos,
        }}
        singleEditorProps={{
          scrollContainerRef,
          linesCount,
          editorLineItems: editorLineItems ?? [],
          selectedLines,
          diffActions: diffActions as DiffActions,
          foldStarts,
          collapsedFoldIds,
          toggleFold,
          foldLabel,
          editorContent,
          handleChange,
          highlightedCode,
          hasCollapsedFolds,
          onCopySelection: hasCollapsedFolds
            ? (projectedContent: string, start: number, end: number) =>
                getExpandedFoldedSelection(
                  localContentRef.current,
                  projectedContent,
                  editorLineItems ?? [],
                  start,
                  end,
                )
            : undefined,
          cursorPos,
          suggestion,
          onAcceptSuggestion: handleAcceptSuggestion,
          cancelSuggestion,
          isCompleting: loading,
          filePath,
          isReadOnly,
          navigationLinksEnabled: reviewNavigationLinksEnabled,
          handleNavigateToAssociated,
          fileContents: state.fileContents,
          handleJumpToTarget,
        }}
      />
    </div>
  );
}
