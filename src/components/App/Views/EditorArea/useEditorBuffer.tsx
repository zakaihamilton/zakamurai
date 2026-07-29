import { DEFAULT_CONTENTS, SCRATCH_CONTENTS } from '@/components/Storage/InitialData';
import Settings from '@/components/Storage/Settings';
import type { EditorAreaUiStateShape } from '@/components/state/domain-types';
import { formatCode } from '@/utils/formatter';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import useCodeFolding from './CodeFolding';
import { EditorAreaUiState } from './EditorAreaState';
import useFileLoader from './FileLoader';
import { applyFoldedContentEdit } from './Folding';
import type { CollapsedFoldsMap, DiffActions, EditorBufferProps, EditorLineItem, FindMatch } from './types';

const countLines = (value: string): number => (value ? value.split('\n').length : 1);
const getTemplateContents = (): Record<string, string> =>
  Settings.getTemplate() === 'scratch' ? SCRATCH_CONTENTS : DEFAULT_CONTENTS;

/** Owns the per-file typing buffer, editor-local UI state, and folded-content editing. */
export default function useEditorBuffer({ file, filePath, fs, fsHandle, state }: EditorBufferProps) {
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
    <K extends keyof EditorAreaUiStateShape>(key: K, nextValue: EditorAreaUiStateShape[K] | ((prev: EditorAreaUiStateShape[K]) => EditorAreaUiStateShape[K])) => {
      editorAreaUiState?.((draft) => {
        draft[key] = typeof nextValue === 'function' ? (nextValue as (prev: EditorAreaUiStateShape[K]) => EditorAreaUiStateShape[K])(draft[key]) : nextValue;
      });
    },
    [editorAreaUiState],
  );
  const setLocalContent = useCallback(
    (nextValue: string | ((prev: string) => string)) => setEditorAreaValue('localContent', nextValue),
    [setEditorAreaValue],
  );
  const setShowFind = useCallback(
    (nextValue: boolean | ((prev: boolean) => boolean)) => setEditorAreaValue('showFind', nextValue),
    [setEditorAreaValue],
  );
  const setFindQuery = useCallback(
    (nextValue: string | ((prev: string) => string)) => setEditorAreaValue('findQuery', nextValue),
    [setEditorAreaValue],
  );
  const setReplaceQuery = useCallback(
    (nextValue: string | ((prev: string) => string)) => setEditorAreaValue('replaceQuery', nextValue),
    [setEditorAreaValue],
  );
  const setMatchIndex = useCallback(
    (nextValue: number | ((prev: number) => number)) => setEditorAreaValue('matchIndex', nextValue),
    [setEditorAreaValue],
  );
  const setMatches = useCallback(
    (nextValue: FindMatch[] | ((prev: FindMatch[]) => FindMatch[])) =>
      setEditorAreaValue('matches', nextValue as EditorAreaUiStateShape['matches']),
    [setEditorAreaValue],
  );
  const setShowSideBySide = useCallback(
    (nextValue: boolean | ((prev: boolean) => boolean)) =>
      setEditorAreaValue('showSideBySide', nextValue),
    [setEditorAreaValue],
  );
  const setDiffActions = useCallback(
    (nextValue: DiffActions | ((prev: DiffActions) => DiffActions)) =>
      setEditorAreaValue('diffActions', nextValue as EditorAreaUiStateShape['diffActions']),
    [setEditorAreaValue],
  );
  const setCollapsedFolds = useCallback(
    (nextValue: CollapsedFoldsMap | ((prev: CollapsedFoldsMap) => CollapsedFoldsMap)) =>
      setEditorAreaValue('collapsedFolds', nextValue as EditorAreaUiStateShape['collapsedFolds']),
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
    collapsedFolds: collapsedFolds as CollapsedFoldsMap,
    setCollapsedFolds,
  });
  const hasDiff = Boolean(state.pendingDiffs?.[filePath]);
  const editorContent = hasDiff ? localContent : folding.visibleFoldedContent.content;
  const editorLineItems: EditorLineItem[] | null = hasDiff ? null : folding.visibleFoldedContent.lineItems;
  const hasCollapsedFolds = hasDiff ? false : folding.visibleFoldedContent.hasCollapsedFolds;

  const handleChange = useCallback(
    (event: { target: { value: string } }) => {
      const nextContent = hasCollapsedFolds
        ? applyFoldedContentEdit(localContentRef.current, event.target.value, editorLineItems || [])
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
