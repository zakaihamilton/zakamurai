import { DEFAULT_CONTENTS, SCRATCH_CONTENTS } from '@/components/Storage/InitialData';
import Settings from '@/components/Storage/Settings';
import { formatCode } from '@/utils/formatter';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import useCodeFolding from './CodeFolding';
import { EditorAreaUiState } from './EditorAreaState';
import useFileLoader from './FileLoader';
import { applyFoldedContentEdit } from './Folding';

const countLines = (value) => (value ? value.split('\n').length : 1);
const getTemplateContents = () =>
  Settings.getTemplate() === 'scratch' ? SCRATCH_CONTENTS : DEFAULT_CONTENTS;

/** Owns the per-file typing buffer, editor-local UI state, and folded-content editing. */
export default function useEditorBuffer({ file, filePath, fs, fsHandle, state }) {
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
  const localContentRef = useRef(localContent);
  useEffect(() => {
    localContentRef.current = localContent;
  }, [localContent]);

  useFileLoader({
    filePath,
    localContent,
    setLocalContent,
    fallbackContent,
    fs,
    fsHandle,
    state,
  });
  const folding = useCodeFolding({
    filePath,
    localContent,
    collapsedFolds,
    setCollapsedFolds,
  });
  const hasDiff = Boolean(state.pendingDiffs?.[filePath]);
  const editorContent = hasDiff ? localContent : folding.visibleFoldedContent.content;
  const editorLineItems = hasDiff ? null : folding.visibleFoldedContent.lineItems;
  const hasCollapsedFolds = hasDiff ? false : folding.visibleFoldedContent.hasCollapsedFolds;

  const handleChange = useCallback(
    (event) => {
      const nextContent = hasCollapsedFolds
        ? applyFoldedContentEdit(localContentRef.current, event.target.value, editorLineItems)
        : event.target.value;
      setLocalContent(nextContent);
      state((draft) => {
        draft.fileContents = { ...draft.fileContents, [filePath]: nextContent };
        if (draft.history?.[filePath]) {
          const history = { ...draft.history };
          history[filePath] = { ...history[filePath], future: [] };
          draft.history = history;
        }
        if (draft.pendingDiffs?.[filePath]) {
          const pendingDiffs = { ...draft.pendingDiffs };
          delete pendingDiffs[filePath];
          draft.pendingDiffs = pendingDiffs;
        }
      });
    },
    [editorLineItems, filePath, hasCollapsedFolds, setLocalContent, state],
  );

  const handleFormat = useCallback(() => {
    const formatted = formatCode(localContent, filePath);
    if (formatted !== localContent) handleChange({ target: { value: formatted } });
  }, [filePath, handleChange, localContent]);

  return {
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
    linesCount: useMemo(() => countLines(localContent), [localContent]),
    editorContent,
    editorLineItems,
    hasCollapsedFolds,
    ...folding,
  };
}
