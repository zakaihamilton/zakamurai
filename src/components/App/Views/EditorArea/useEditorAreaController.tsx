import { LogState } from '@/components/App/Views/LogArea';
import { setInDraft } from '@/utils/StateUtils';
import { useCallback, useEffect, useRef } from 'react';
import useAssociationNavigator from './AssociationNavigator';
import useCompletion from './CompletionHandler';
import { getExpandedFoldedSelection } from './Folding';
import useHighlightLoader from './HighlightLoader';
import useScrollHandler from './ScrollHandler';
import type {
  DiffActions,
  EditorAreaFile,
  EditorContentProps,
  EditorFileSystem,
  EditorStateStore,
  EditorSurfaceProps,
  FindMatch,
  ScrollContainerRef,
  ShouldScrollRef,
  TabStateStore,
} from './types';
import useEditorBuffer from './useEditorBuffer';
import useEditorNavigationMode from './useEditorNavigationMode';

type UseEditorAreaControllerParams = {
  file?: EditorAreaFile;
  fsHandle?: FileSystemFileHandle;
  filePath: string;
  fs: EditorFileSystem;
  tabState: TabStateStore | undefined;
  state: EditorStateStore;
};

/** Owns editor behavior and returns the props consumed by the presentational surface. */
export default function useEditorAreaController({
  file,
  fsHandle,
  filePath,
  fs,
  tabState,
  state,
}: UseEditorAreaControllerParams): EditorSurfaceProps {
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

  const contentProps: EditorContentProps = {
    showSideBySide,
    hasDiff,
    sideBySideProps: {
      diffData: diffData ?? { originalContent: '', modifiedContent: '', diffs: [] },
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
    },
    singleEditorProps: {
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
    },
  };

  return {
    toolingProps: {
      filePath,
      fileName: file?.name,
      localContent,
      setLocalContent,
      state,
      fs,
      tabState,
      scrollContainerRef,
      showFind,
      setShowFind,
      findQuery,
      setFindQuery,
      replaceQuery,
      setReplaceQuery,
      matchIndex,
      setMatchIndex,
      matches: matches as FindMatch[],
      setMatches,
      hasDiff,
      hasPendingDeletion,
      handleApprove: (diffActions as DiffActions).handleApprove ?? (() => {}),
      handleUndo: (diffActions as DiffActions).handleUndo ?? (() => {}),
      showSideBySide,
      setShowSideBySide,
      handleFormat,
      onCopy: () => navigator.clipboard?.writeText(localContent),
      associatedPath,
      onNavigateToAssociated: handleNavigateToAssociated,
      isReadOnly,
      setIsReadOnly,
      onSelectView: handleSelectView,
      onStateChange: setDiffActions,
      handleChange,
    },
    contentProps,
  };
}
